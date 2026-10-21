-- Hàng đợi tạo nội dung từ (Prompt 2.1).
--
-- Từ chưa có trong kho → một việc (word_jobs) cho mỗi (language, lemma, pos). Edge Function
-- generate-word nhận yêu cầu, xếp việc rồi xử lý ngay trong nền; pg_cron mỗi phút gọi
-- lại worker cho việc chờ thử lại, việc vượt trần ngày, việc tạo trước (bulk).
-- Dùng bảng + FOR UPDATE SKIP LOCKED thay cho pgmq vì app cần đọc trạng thái từng việc
-- ("Đang chuẩn bị nội dung") và gộp yêu cầu trùng.
--
-- Mọi hàm public.* ở đây chỉ service role gọi được (Edge Function, script tạo trước).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

/* ---------- Giới hạn (đổi bằng SQL, không cần deploy lại) ---------- */

create table private.settings (
  key text primary key,
  value integer not null check (value >= 0),
  note text
);

insert into private.settings (key, value, note) values
  ('user_daily_new_words', 50, 'Số từ mới (chưa có trong kho) mỗi người được yêu cầu mỗi ngày'),
  ('global_daily_new_words', 1000, 'Trần từ mới do người dùng yêu cầu, toàn hệ thống, mỗi ngày (~$4)'),
  ('bulk_daily_new_words', 1000, 'Trần từ tạo trước (bulk) mỗi ngày, chỉ chạy khi không có việc của người dùng'),
  ('worker_parallel', 3, 'Số worker pg_cron gọi song song mỗi phút');

create function private.setting(p_key text)
returns integer
language sql
stable
set search_path = ''
as $$
  select value from private.settings where key = p_key;
$$;

/** Đầu ngày hôm nay theo giờ Việt Nam (giới hạn theo ngày tính theo giờ người dùng). */
create function private.vn_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
$$;

revoke all on table private.settings from public, anon, authenticated;
revoke all on function private.setting(text) from public, anon, authenticated;
revoke all on function private.vn_day_start() from public, anon, authenticated;
-- Hàm public.* bên dưới chạy với quyền người gọi (service role) nên cần đọc được giới hạn.
grant usage on schema private to service_role;
grant select on table private.settings to service_role;
grant execute on function private.setting(text), private.vn_day_start() to service_role;

/* ---------- Bảng ---------- */

create table public.word_jobs (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en', 'ja', 'zh', 'ko', 'fr')),
  lemma text not null
    check (lemma <> '' and lemma = btrim(lemma) and lemma = lower(lemma) and char_length(lemma) <= 64),
  -- null: worker chọn loại từ phổ biến nhất theo từ điển.
  pos text check (pos in (
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'determiner', 'interjection', 'phrasal_verb', 'phrase'
  )),
  -- user: người dùng thêm từ; bulk: script tạo trước (ưu tiên thấp hơn, trần riêng).
  source text not null default 'user' check (source in ('user', 'bulk')),
  -- Thứ hạng tần suất (danh sách NGSL) để ghi vào words.frequency_rank.
  frequency_rank integer check (frequency_rank > 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  -- Lần đầu worker nhận việc: dùng để tính trần ngày (thử lại không tính thêm).
  first_started_at timestamptz,
  finished_at timestamptz,
  word_id uuid references public.words (id) on delete set null,
  last_error text check (char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.word_jobs is
  'Hàng đợi tạo nội dung từ. Người dùng đọc việc mình yêu cầu; chỉ service role ghi.';

-- Mỗi từ chỉ có một việc đang chờ/chạy: hai người cùng thêm một từ → AI chạy một lần.
create unique index word_jobs_active_key
  on public.word_jobs (language, lemma, (coalesce(pos, '')))
  where status in ('queued', 'running');
create index word_jobs_due_idx on public.word_jobs (run_after) where status = 'queued';
create index word_jobs_running_idx on public.word_jobs (locked_at) where status = 'running';
create index word_jobs_started_idx on public.word_jobs (source, first_started_at);
create index word_jobs_word_idx on public.word_jobs (word_id);

create trigger word_jobs_set_updated_at
  before update on public.word_jobs
  for each row execute function public.set_updated_at();

create table public.word_job_requests (
  job_id uuid not null references public.word_jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);

comment on table public.word_job_requests is
  'Ai đã yêu cầu việc nào (đếm giới hạn từ mới mỗi ngày, cho người dùng đọc trạng thái).';

create index word_job_requests_user_idx on public.word_job_requests (user_id, created_at);

alter table public.word_jobs enable row level security;
alter table public.word_job_requests enable row level security;

create policy "word_jobs: người đã yêu cầu đọc"
  on public.word_jobs for select to authenticated
  using (exists (
    select 1 from public.word_job_requests r
    where r.job_id = word_jobs.id and r.user_id = (select auth.uid())
  ));

create policy "word_job_requests: chủ sở hữu đọc"
  on public.word_job_requests for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.word_jobs, public.word_job_requests from anon;
revoke insert, update, delete, truncate on public.word_jobs, public.word_job_requests
  from authenticated;

/* ---------- Hàm cho Edge Function (service role) ---------- */

-- Xếp việc cho một người dùng: gộp với việc đang chờ của cùng từ, kiểm tra giới hạn ngày.
-- Trả về { job_id, status, limit_reached, daily_limit }.
create function public.request_word_job(
  p_user_id uuid,
  p_language text,
  p_lemma text,
  p_pos text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer := private.setting('user_daily_new_words');
  v_job public.word_jobs;
  v_used integer;
begin
  -- Khóa theo người dùng để hai yêu cầu song song không cùng lọt qua giới hạn.
  perform pg_advisory_xact_lock(hashtextextended('word_job_requests:' || p_user_id::text, 0));

  select * into v_job from public.word_jobs
  where language = p_language and lemma = p_lemma and pos is not distinct from p_pos
    and status in ('queued', 'running');

  -- Đã yêu cầu việc này rồi (gọi lại để hỏi trạng thái) → không tính thêm.
  if v_job.id is not null and exists (
    select 1 from public.word_job_requests where job_id = v_job.id and user_id = p_user_id
  ) then
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
                              'limit_reached', false, 'daily_limit', v_limit);
  end if;

  select count(*) into v_used from public.word_job_requests
  where user_id = p_user_id and created_at >= private.vn_day_start();
  if v_used >= v_limit then
    return jsonb_build_object('job_id', null, 'status', null,
                              'limit_reached', true, 'daily_limit', v_limit);
  end if;

  if v_job.id is null then
    insert into public.word_jobs (language, lemma, pos, source)
    values (p_language, p_lemma, p_pos, 'user')
    on conflict (language, lemma, (coalesce(pos, ''))) where status in ('queued', 'running')
    do nothing
    returning * into v_job;
    if v_job.id is null then
      -- Yêu cầu song song của người khác vừa tạo việc này.
      select * into v_job from public.word_jobs
      where language = p_language and lemma = p_lemma and pos is not distinct from p_pos
        and status in ('queued', 'running');
    end if;
  elsif v_job.source = 'bulk' then
    -- Người dùng cần từ đang nằm trong hàng tạo trước → đưa lên ưu tiên của người dùng.
    update public.word_jobs set source = 'user', run_after = least(run_after, now())
    where id = v_job.id;
  end if;

  insert into public.word_job_requests (job_id, user_id) values (v_job.id, p_user_id)
  on conflict do nothing;

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
                            'limit_reached', false, 'daily_limit', v_limit);
end;
$$;

-- Worker nhận tối đa p_limit việc đến hạn: việc của người dùng trước, việc tạo trước sau;
-- việc chạy quá 5 phút (worker chết giữa chừng) được nhận lại. Việc mới chỉ được nhận khi
-- còn trong trần ngày của nguồn đó. p_job_id: chỉ nhận đúng việc vừa xếp.
-- Trả về mảng việc dạng JSON.
create function public.claim_word_jobs(p_limit integer default 1, p_job_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_day_start timestamptz := private.vn_day_start();
  v_budget_user integer;
  v_budget_bulk integer;
  v_claimed jsonb := '[]';
  v_count integer := 0;
  v_job public.word_jobs;
begin
  -- Khóa chung khi tính trần ngày để các worker song song không cùng vượt trần.
  perform pg_advisory_xact_lock(hashtextextended('claim_word_jobs', 0));

  select private.setting('global_daily_new_words') - count(*) into v_budget_user
  from public.word_jobs where source = 'user' and first_started_at >= v_day_start;
  select private.setting('bulk_daily_new_words') - count(*) into v_budget_bulk
  from public.word_jobs where source = 'bulk' and first_started_at >= v_day_start;

  for v_job in
    select * from public.word_jobs j
    where (p_job_id is null or j.id = p_job_id)
      and ((j.status = 'queued' and j.run_after <= now())
        or (j.status = 'running' and j.locked_at < now() - interval '5 minutes'))
    order by (j.source = 'user') desc, j.run_after, j.created_at
    limit 50
    for update skip locked
  loop
    exit when v_count >= p_limit;
    if v_job.first_started_at is null then
      if v_job.source = 'user' then
        continue when v_budget_user <= 0;
        v_budget_user := v_budget_user - 1;
      else
        continue when v_budget_bulk <= 0;
        v_budget_bulk := v_budget_bulk - 1;
      end if;
    end if;

    update public.word_jobs
    set status = 'running', attempts = attempts + 1, locked_at = now(),
        first_started_at = coalesce(first_started_at, now())
    where id = v_job.id
    returning * into v_job;

    v_claimed := v_claimed || jsonb_build_array(jsonb_build_object(
      'id', v_job.id, 'language', v_job.language, 'lemma', v_job.lemma, 'pos', v_job.pos,
      'source', v_job.source, 'attempts', v_job.attempts,
      'frequency_rank', v_job.frequency_rank));
    v_count := v_count + 1;
  end loop;

  return v_claimed;
end;
$$;

-- Lưu nội dung đã tạo (một transaction) và đóng việc. Từ đã có (worker khác lưu trước,
-- hoặc trùng (language, lemma, pos)) thì giữ bản cũ. Trả về words.id.
create function public.save_generated_word(
  p_job_id uuid,
  p_word jsonb,
  p_senses jsonb,
  p_details jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_word_id uuid;
begin
  insert into public.words (
    id, language, lemma, pos, ipa_us, ipa_uk, cefr, frequency_rank, register, forms, details,
    schema_version, generated_by, reviewed
  )
  select id, language, lemma, pos, ipa_us, ipa_uk, cefr, frequency_rank, register, forms, details,
         schema_version, generated_by, coalesce(reviewed, false)
  from jsonb_populate_record(null::public.words, p_word)
  on conflict (language, lemma, pos) do nothing
  returning id into v_word_id;

  if v_word_id is null then
    select w.id into v_word_id from public.words w
    where w.language = p_word ->> 'language' and w.lemma = p_word ->> 'lemma'
      and w.pos = p_word ->> 'pos';
  else
    insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi, image_query)
    select id, v_word_id, sense_order, definition_en, meaning_vi, image_query
    from jsonb_populate_recordset(null::public.word_senses, p_senses);

    insert into public.word_details (
      sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes
    )
    select sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes
    from jsonb_populate_recordset(null::public.word_details, p_details);
  end if;

  perform public.complete_word_job(p_job_id, v_word_id);
  return v_word_id;
end;
$$;

-- Đóng việc khi từ đã có (vd loại từ do từ điển chọn đã được tạo trước đó).
create function public.complete_word_job(p_job_id uuid, p_word_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.word_jobs
  set status = 'done', word_id = p_word_id, finished_at = now(), locked_at = null,
      last_error = null
  where id = p_job_id;
$$;

-- Việc lỗi: p_retry_at có giá trị → xếp lại; null → thất bại hẳn.
create function public.fail_word_job(
  p_job_id uuid,
  p_error text,
  p_retry_at timestamptz default null
)
returns void
language sql
set search_path = ''
as $$
  update public.word_jobs
  set status = case when p_retry_at is null then 'failed' else 'queued' end,
      run_after = coalesce(p_retry_at, run_after),
      finished_at = case when p_retry_at is null then now() end,
      locked_at = null,
      last_error = left(p_error, 2000)
  where id = p_job_id;
$$;

-- Xếp việc tạo trước từ danh sách [{ lemma, pos?, frequency_rank? }]. Bỏ qua từ đã có
-- trong kho hoặc đang chờ. Chạy lại an toàn (tiếp tục được qua nhiều ngày). Trả về số việc mới.
create function public.enqueue_bulk_words(p_language text, p_items jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with items as (
    select distinct on (lower(btrim(i.lemma)), i.pos)
      lower(btrim(i.lemma)) as lemma, i.pos, i.frequency_rank
    from jsonb_to_recordset(p_items) as i (lemma text, pos text, frequency_rank integer)
    where coalesce(btrim(i.lemma), '') <> ''
    order by lower(btrim(i.lemma)), i.pos, i.frequency_rank
  ), inserted as (
    insert into public.word_jobs (language, lemma, pos, source, frequency_rank)
    select p_language, items.lemma, items.pos, 'bulk', items.frequency_rank
    from items
    where not exists (
      select 1 from public.words w
      where w.language = p_language and w.lemma = items.lemma
        and (items.pos is null or w.pos = items.pos)
    )
    on conflict (language, lemma, (coalesce(pos, ''))) where status in ('queued', 'running')
    do nothing
    returning 1
  )
  select count(*) into v_count from inserted;
  return v_count;
end;
$$;

-- Edge Function kiểm tra lời gọi worker từ pg_cron. Khóa nằm trong Vault, không rời database.
create function public.verify_worker_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select decrypted_secret = p_secret and length(p_secret) >= 32
     from vault.decrypted_secrets where name = 'word_worker_secret' limit 1),
    false);
$$;

revoke all on function
  public.request_word_job(uuid, text, text, text),
  public.claim_word_jobs(integer, uuid),
  public.save_generated_word(uuid, jsonb, jsonb, jsonb),
  public.complete_word_job(uuid, uuid),
  public.fail_word_job(uuid, text, timestamptz),
  public.enqueue_bulk_words(text, jsonb),
  public.verify_worker_secret(text)
from public, anon, authenticated;

grant execute on function
  public.request_word_job(uuid, text, text, text),
  public.claim_word_jobs(integer, uuid),
  public.save_generated_word(uuid, jsonb, jsonb, jsonb),
  public.complete_word_job(uuid, uuid),
  public.fail_word_job(uuid, text, timestamptz),
  public.enqueue_bulk_words(text, jsonb),
  public.verify_worker_secret(text)
to service_role;

/* ---------- pg_cron: gọi worker mỗi phút khi có việc đến hạn ---------- */

-- Khóa worker tự sinh trong Vault (mỗi môi trường một khóa riêng).
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'word_worker_secret',
  'Edge Function generate-word kiểm tra lời gọi worker từ pg_cron')
where not exists (select 1 from vault.secrets where name = 'word_worker_secret');

-- URL project đặt riêng từng môi trường (cloud: https://<ref>.supabase.co); chưa đặt thì
-- cron không làm gì.
create function private.kick_word_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_due integer;
  v_calls integer;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'word_worker_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  select count(*) into v_due from public.word_jobs
  where (status = 'queued' and run_after <= now())
     or (status = 'running' and locked_at < now() - interval '5 minutes');
  v_calls := least(v_due, private.setting('worker_parallel'));

  for i in 1..v_calls loop
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/generate-word',
      body := '{"action": "work"}'::jsonb,
      headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
      timeout_milliseconds := 5000);
  end loop;
  return v_calls;
end;
$$;

revoke all on function private.kick_word_worker() from public, anon, authenticated;

select cron.schedule('word-worker', '* * * * *', 'select private.kick_word_worker()');
