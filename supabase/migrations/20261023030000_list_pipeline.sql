-- Pipeline phân tích danh sách của Admin (Prompt 7.2).
--
-- Edge Function analyze-list chạy 6 bước (trích xuất → chuẩn hóa → chọn nghĩa → nội dung →
-- sắp xếp → cảnh báo). Kết quả từng từ nằm trong curated_list_candidates nên chạy lại được từ
-- bước lỗi. Từ chưa có trong kho xếp vào word_jobs với nguồn 'admin' (trần riêng 2.000 từ/ngày,
-- 20 worker song song, không trừ giới hạn của tài khoản). Như word_jobs: bảng + pg_cron, không
-- dùng pgmq (cần đọc tiến độ từng việc, chạy lại từ bước lỗi).

/* ---------- Giới hạn ---------- */

insert into private.settings (key, value, note) values
  ('admin_daily_new_words', 2000, 'Trần từ mới cho danh sách Admin mỗi ngày (giờ VN), riêng với trần của người dùng'),
  ('admin_worker_parallel', 20, 'Số worker generate-word chạy song song khi có việc của danh sách Admin')
on conflict (key) do nothing;

/* ---------- word_jobs: nguồn 'admin' và chi phí ---------- */

alter table public.word_jobs drop constraint word_jobs_source_check;
alter table public.word_jobs
  add constraint word_jobs_source_check check (source in ('user', 'bulk', 'admin')),
  add column input_tokens integer not null default 0 check (input_tokens >= 0),
  add column output_tokens integer not null default 0 check (output_tokens >= 0),
  add column cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0);

-- Như bản ở 20261021020000_word_jobs.sql, thêm trần riêng cho nguồn 'admin'. Thứ tự ưu tiên:
-- người dùng → danh sách Admin → tạo trước.
create or replace function public.claim_word_jobs(p_limit integer default 1, p_job_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_day_start timestamptz := private.vn_day_start();
  v_budget_user integer;
  v_budget_admin integer;
  v_budget_bulk integer;
  v_claimed jsonb := '[]';
  v_count integer := 0;
  v_job public.word_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('claim_word_jobs', 0));

  select private.setting('global_daily_new_words') - count(*) into v_budget_user
  from public.word_jobs where source = 'user' and first_started_at >= v_day_start;
  select private.setting('admin_daily_new_words') - count(*) into v_budget_admin
  from public.word_jobs where source = 'admin' and first_started_at >= v_day_start;
  select private.setting('bulk_daily_new_words') - count(*) into v_budget_bulk
  from public.word_jobs where source = 'bulk' and first_started_at >= v_day_start;

  for v_job in
    select * from public.word_jobs j
    where (p_job_id is null or j.id = p_job_id)
      and ((j.status = 'queued' and j.run_after <= now())
        or (j.status = 'running' and j.locked_at < now() - interval '5 minutes'))
    order by case j.source when 'user' then 0 when 'admin' then 1 else 2 end, j.run_after, j.created_at
    limit 50
    for update skip locked
  loop
    exit when v_count >= p_limit;
    if v_job.first_started_at is null then
      if v_job.source = 'user' then
        continue when v_budget_user <= 0;
        v_budget_user := v_budget_user - 1;
      elsif v_job.source = 'admin' then
        continue when v_budget_admin <= 0;
        v_budget_admin := v_budget_admin - 1;
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

-- Cộng token/chi phí của lượt tạo nội dung vào việc (danh sách Admin cộng lại thành chi phí).
create function public.add_word_job_usage(
  p_job_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_usd numeric
)
returns void
language sql
set search_path = ''
as $$
  update public.word_jobs
  set input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
      cost_usd = cost_usd + greatest(coalesce(p_cost_usd, 0), 0)
  where id = p_job_id;
$$;

-- Xếp việc tạo nội dung cho danh sách Admin [{ key, lemma, pos? }]. Từ đã có trong kho → trả
-- word_id; đang có việc chờ/chạy (của ai cũng vậy) → dùng chung việc đó; chưa có → việc mới
-- nguồn 'admin'. Trả về [{ key, job_id, word_id, created }].
create function public.enqueue_admin_words(p_language text, p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_word_id uuid;
  v_job_id uuid;
  v_created boolean;
  v_result jsonb := '[]';
begin
  for v_item in
    select i.key, lower(btrim(i.lemma)) as lemma, nullif(i.pos, '') as pos
    from jsonb_to_recordset(p_items) as i (key text, lemma text, pos text)
    where coalesce(btrim(i.lemma), '') <> ''
  loop
    v_word_id := null;
    v_job_id := null;
    v_created := false;

    select w.id into v_word_id from public.words w
    where w.language = p_language and w.lemma = v_item.lemma
      and (v_item.pos is null or w.pos = v_item.pos)
    order by w.frequency_rank nulls last, w.created_at
    limit 1;

    if v_word_id is null then
      insert into public.word_jobs (language, lemma, pos, source)
      values (p_language, v_item.lemma, v_item.pos, 'admin')
      on conflict (language, lemma, (coalesce(pos, ''))) where status in ('queued', 'running')
      do nothing
      returning id into v_job_id;
      v_created := v_job_id is not null;
      if v_job_id is null then
        select j.id into v_job_id from public.word_jobs j
        where j.language = p_language and j.lemma = v_item.lemma
          and coalesce(j.pos, '') = coalesce(v_item.pos, '')
          and j.status in ('queued', 'running');
      end if;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'key', v_item.key, 'job_id', v_job_id, 'word_id', v_word_id, 'created', v_created));
  end loop;
  return v_result;
end;
$$;

-- Như bản ở 20261021020000_word_jobs.sql. Có việc của danh sách Admin thì giữ đủ
-- admin_worker_parallel worker đang chạy (trừ số việc đang chạy); không có thì như cũ.
create or replace function private.kick_word_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_due integer;
  v_running integer;
  v_admin boolean;
  v_calls integer;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'word_worker_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  select
    count(*) filter (where (status = 'queued' and run_after <= now())
                        or (status = 'running' and locked_at < now() - interval '5 minutes')),
    count(*) filter (where status = 'running' and locked_at >= now() - interval '5 minutes'),
    coalesce(bool_or(source = 'admin' and status = 'queued' and run_after <= now()), false)
  into v_due, v_running, v_admin
  from public.word_jobs
  where status in ('queued', 'running');

  if v_admin then
    v_calls := least(v_due, greatest(private.setting('admin_worker_parallel') - v_running, 0));
  else
    v_calls := least(v_due, private.setting('worker_parallel'));
  end if;

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

-- analyze-list gọi khi vừa xếp việc và trong lúc chờ, để không phải đợi pg_cron (1 phút).
create function public.kick_word_worker_now()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.kick_word_worker();
$$;

/* ---------- Media: ưu tiên từ của danh sách Admin ---------- */

-- Như bản ở 20261021030000_word_media.sql; từ do danh sách Admin tạo được làm trước.
create or replace function public.claim_media_words(p_limit integer, p_include_images boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_claimed jsonb := '[]';
  v_word public.words;
begin
  for v_word in
    select * from public.words w
    where (w.media_locked_at is null or w.media_locked_at < now() - interval '5 minutes')
      and (
        (w.language = 'en' and (w.audio_us_url is null or w.audio_uk_url is null))
        or (p_include_images and exists (
          select 1 from public.word_senses s where s.word_id = w.id and s.image_checked_at is null
        ))
      )
    order by
      exists (select 1 from public.word_jobs j where j.word_id = w.id and j.source = 'admin') desc,
      (w.frequency_rank is null) desc, w.frequency_rank, w.created_at
    limit p_limit
    for update skip locked
  loop
    update public.words set media_locked_at = now() where id = v_word.id;
    v_claimed := v_claimed || jsonb_build_array(jsonb_build_object(
      'id', v_word.id, 'language', v_word.language, 'lemma', v_word.lemma, 'pos', v_word.pos,
      'audio_us_url', v_word.audio_us_url, 'audio_uk_url', v_word.audio_uk_url,
      'senses', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'image_query', s.image_query)
                         order by s.sense_order)
        from public.word_senses s
        where s.word_id = v_word.id and s.image_checked_at is null
      ), '[]'::jsonb)));
  end loop;
  return v_claimed;
end;
$$;

/* ---------- Việc phân tích: khóa, lịch chạy, trạng thái giữa chừng ---------- */

-- state: tiến độ trong bước (vd số đoạn bài đọc đã trích) và tóm tắt khi xong.
-- run_after: việc đang chờ (vd chờ tạo nội dung) chỉ được nhận lại sau thời điểm này.
-- attempts: số lần lỗi liên tiếp ở bước hiện tại (quá 3 lần → thất bại, Admin bấm chạy lại).
alter table public.import_jobs
  add column state jsonb not null default '{}' check (jsonb_typeof(state) = 'object'),
  add column locked_at timestamptz,
  add column run_after timestamptz not null default now(),
  add column attempts smallint not null default 0 check (attempts >= 0);

create index import_jobs_admin_due_idx on public.import_jobs (run_after)
  where kind = 'admin_list' and status in ('queued', 'running');

/* ---------- Kết quả giữa chừng của từng từ ---------- */

create table public.curated_list_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs (id) on delete cascade,
  list_id uuid not null references public.curated_lists (id) on delete cascade,
  -- raw: vừa trích; merged: đã về từ gốc, gộp trùng, tra kho; triaged: đã ước lượng CEFR/chính tả.
  stage text not null default 'raw' check (stage in ('raw', 'merged', 'triaged')),
  -- Thứ tự xuất hiện trong nguồn (giữ thứ tự Admin khi không có thông tin khác).
  position integer not null check (position >= 0),
  surface text not null check (char_length(surface) between 1 and 200),
  lemma text check (char_length(lemma) <= 64),
  pos text check (pos in (
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'determiner', 'interjection', 'phrasal_verb', 'phrase'
  )),
  context_sentence text check (char_length(context_sentence) <= 500),
  -- Cột nghĩa của file: dùng để chọn nghĩa khớp nhất.
  meaning_hint text check (char_length(meaning_hint) <= 500),
  note text check (char_length(note) <= 1000),
  tags text[] not null default '{}',
  occurrences integer not null default 1 check (occurrences >= 1),
  cefr text check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  frequency_rank integer check (frequency_rank > 0),
  rare boolean not null default false,
  -- Chữ gốc trong nguồn khi đã sửa chính tả.
  spelling_from text check (char_length(spelling_from) <= 200),
  word_id uuid references public.words (id) on delete set null,
  sense_id uuid references public.word_senses (id) on delete set null,
  sense_method text check (sense_method in ('single', 'meaning', 'context', 'default')),
  sense_confidence real check (sense_confidence between 0 and 1),
  word_job_id uuid references public.word_jobs (id) on delete set null,
  -- Việc tạo nội dung do danh sách này tạo ra (tính chi phí vào danh sách).
  job_created boolean not null default false,
  subtopic text check (char_length(subtopic) <= 60),
  item_order integer check (item_order >= 0),
  dropped text check (dropped in ('invalid', 'not_a_word', 'below_level', 'content_failed', 'duplicate')),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.curated_list_candidates is
  'Kết quả từng bước phân tích danh sách Admin (Prompt 7.2). Admin đọc; chỉ service role ghi.';

create index curated_list_candidates_job_idx on public.curated_list_candidates (job_id, position);
create index curated_list_candidates_word_job_idx on public.curated_list_candidates (word_job_id)
  where word_job_id is not null;

create trigger curated_list_candidates_set_updated_at
  before update on public.curated_list_candidates
  for each row execute function public.set_updated_at();

alter table public.curated_list_candidates enable row level security;

create policy "curated_list_candidates: admin đọc"
  on public.curated_list_candidates for select to authenticated
  using ((select private.is_admin()));

revoke all on public.curated_list_candidates from anon;
revoke insert, update, delete, truncate on public.curated_list_candidates from authenticated;

/* ---------- Hàm cho Edge Function analyze-list (service role) ---------- */

-- Nhận một việc phân tích đến hạn (chưa có worker giữ, hoặc worker giữ quá 3 phút đã chết).
-- Trả về việc kèm thông tin danh sách, null nếu không có việc.
create function public.claim_list_job()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_job public.import_jobs;
  v_list public.curated_lists;
begin
  select * into v_job from public.import_jobs j
  where j.kind = 'admin_list' and j.status in ('queued', 'running') and j.run_after <= now()
    and (j.locked_at is null or j.locked_at < now() - interval '3 minutes')
  order by j.run_after, j.created_at
  limit 1
  for update skip locked;
  if v_job.id is null then
    return null;
  end if;

  update public.import_jobs
  set status = 'running', locked_at = now(), started_at = coalesce(started_at, now())
  where id = v_job.id
  returning * into v_job;
  select * into v_list from public.curated_lists where id = v_job.list_id;

  return jsonb_build_object(
    'id', v_job.id, 'list_id', v_job.list_id, 'step', v_job.step, 'done', v_job.done,
    'total', v_job.total, 'options', v_job.options, 'state', v_job.state,
    'attempts', v_job.attempts,
    'list', jsonb_build_object('language', v_list.language, 'target_cefr', v_list.target_cefr,
      'title', v_list.title, 'topic', v_list.topic, 'purpose', v_list.purpose));
end;
$$;

-- Ghi tiến độ và trả việc (bỏ khóa). p_wait_seconds: chỉ nhận lại sau ngần ấy giây (chờ tạo
-- nội dung). Đổi bước thì đặt lại số lần lỗi. Token/chi phí cộng dồn.
create function public.save_list_job(
  p_job_id uuid,
  p_step text,
  p_done integer,
  p_total integer,
  p_state jsonb,
  p_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_cost_usd numeric default 0,
  p_wait_seconds integer default 0,
  p_keep_lock boolean default false
)
returns void
language sql
set search_path = ''
as $$
  update public.import_jobs
  set step = p_step,
      done = greatest(p_done, 0),
      total = greatest(p_total, 0),
      state = coalesce(p_state, state),
      attempts = case when step = p_step then attempts else 0 end,
      input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
      cost_usd = cost_usd + greatest(coalesce(p_cost_usd, 0), 0),
      run_after = now() + make_interval(secs => greatest(coalesce(p_wait_seconds, 0), 0)),
      locked_at = case when p_keep_lock then now() end
  where id = p_job_id and kind = 'admin_list' and status = 'running';
$$;

-- Lỗi ở bước hiện tại: dưới 3 lần thì thử lại sau 1 phút; quá thì việc thất bại, danh sách về
-- Nháp (Admin chạy lại từ bước lỗi hoặc phân tích lại).
create function public.fail_list_job(p_job_id uuid, p_error text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_job public.import_jobs;
begin
  update public.import_jobs
  set attempts = attempts + 1,
      errors = (case when jsonb_array_length(errors) >= 20 then errors - 0 else errors end)
        || jsonb_build_array(jsonb_build_object('step', step, 'message', left(p_error, 1000),
                                                'at', now())),
      locked_at = null,
      run_after = now() + interval '1 minute'
  where id = p_job_id and kind = 'admin_list'
  returning * into v_job;
  if v_job.id is null then
    return null;
  end if;
  if v_job.attempts >= 3 then
    update public.import_jobs set status = 'failed', finished_at = now() where id = p_job_id;
    update public.curated_lists set status = 'draft' where id = v_job.list_id;
    return 'failed';
  end if;
  return 'retry';
end;
$$;

-- Ghi các dòng kết quả (thêm mới hoặc cập nhật theo id). p_replace_raw: xóa các dòng 'raw' của
-- việc trước khi ghi (bước chuẩn hóa thay dòng trích xuất bằng dòng đã gộp, trong một transaction).
create function public.save_list_candidates(
  p_job_id uuid,
  p_rows jsonb,
  p_replace_raw boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_list_id uuid;
  v_count integer;
begin
  select list_id into v_list_id from public.import_jobs where id = p_job_id and kind = 'admin_list';
  if v_list_id is null then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if p_replace_raw then
    delete from public.curated_list_candidates where job_id = p_job_id and stage = 'raw';
  end if;

  insert into public.curated_list_candidates (
    id, job_id, list_id, stage, position, surface, lemma, pos, context_sentence, meaning_hint,
    note, tags, occurrences, cefr, frequency_rank, rare, spelling_from, word_id, sense_id,
    sense_method, sense_confidence, word_job_id, job_created, subtopic, item_order, dropped,
    warnings
  )
  select coalesce(r.id, gen_random_uuid()), p_job_id, v_list_id, coalesce(r.stage, 'raw'),
    r.position, r.surface, r.lemma, r.pos, r.context_sentence, r.meaning_hint, r.note,
    coalesce(r.tags, '{}'), coalesce(r.occurrences, 1), r.cefr, r.frequency_rank,
    coalesce(r.rare, false), r.spelling_from, r.word_id, r.sense_id, r.sense_method,
    r.sense_confidence, r.word_job_id, coalesce(r.job_created, false), r.subtopic, r.item_order,
    r.dropped, coalesce(r.warnings, '[]')
  from jsonb_populate_recordset(null::public.curated_list_candidates, p_rows) r
  on conflict (id) do update set
    stage = excluded.stage, position = excluded.position, surface = excluded.surface,
    lemma = excluded.lemma, pos = excluded.pos, context_sentence = excluded.context_sentence,
    meaning_hint = excluded.meaning_hint, note = excluded.note, tags = excluded.tags,
    occurrences = excluded.occurrences, cefr = excluded.cefr,
    frequency_rank = excluded.frequency_rank, rare = excluded.rare,
    spelling_from = excluded.spelling_from, word_id = excluded.word_id,
    sense_id = excluded.sense_id, sense_method = excluded.sense_method,
    sense_confidence = excluded.sense_confidence, word_job_id = excluded.word_job_id,
    job_created = excluded.job_created, subtopic = excluded.subtopic,
    item_order = excluded.item_order, dropped = excluded.dropped, warnings = excluded.warnings
  where curated_list_candidates.job_id = p_job_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Xong: thay các mục của danh sách bằng từ đã giữ lại (theo item_order), ghi tóm tắt, chuyển
-- danh sách sang Chờ duyệt. Hai dòng cùng một nghĩa → giữ dòng đứng trước.
create function public.finish_list_analysis(p_job_id uuid, p_summary jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_list_id uuid;
  v_count integer;
begin
  select list_id into v_list_id from public.import_jobs
  where id = p_job_id and kind = 'admin_list' and status = 'running'
  for update;
  if v_list_id is null then
    raise exception 'job_not_running' using errcode = '55000';
  end if;

  delete from public.curated_list_items where list_id = v_list_id;
  insert into public.curated_list_items (
    list_id, sense_id, item_order, subtopic, warnings, admin_note, context_sentence
  )
  select v_list_id, c.sense_id,
    (row_number() over (order by c.item_order, c.position))::integer - 1,
    c.subtopic, c.warnings, left(c.note, 1000), c.context_sentence
  from (
    select distinct on (sense_id) *
    from public.curated_list_candidates
    where job_id = p_job_id and dropped is null and sense_id is not null
    order by sense_id, item_order nulls last, position
  ) c;
  get diagnostics v_count = row_count;

  update public.import_jobs
  set status = 'succeeded', step = 'done', done = v_count, total = v_count,
      state = state || jsonb_build_object('summary', coalesce(p_summary, '{}'::jsonb)),
      locked_at = null, finished_at = now()
  where id = p_job_id;
  update public.curated_lists set status = 'review' where id = v_list_id;
  return v_count;
end;
$$;

revoke all on function
  public.add_word_job_usage(uuid, integer, integer, numeric),
  public.enqueue_admin_words(text, jsonb),
  public.kick_word_worker_now(),
  public.claim_list_job(),
  public.save_list_job(uuid, text, integer, integer, jsonb, bigint, bigint, numeric, integer, boolean),
  public.fail_list_job(uuid, text),
  public.save_list_candidates(uuid, jsonb, boolean),
  public.finish_list_analysis(uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.add_word_job_usage(uuid, integer, integer, numeric),
  public.enqueue_admin_words(text, jsonb),
  public.kick_word_worker_now(),
  public.claim_list_job(),
  public.save_list_job(uuid, text, integer, integer, jsonb, bigint, bigint, numeric, integer, boolean),
  public.fail_list_job(uuid, text),
  public.save_list_candidates(uuid, jsonb, boolean),
  public.finish_list_analysis(uuid, jsonb)
to service_role;

/* ---------- pg_cron: gọi analyze-list khi có việc đến hạn ---------- */

create function private.kick_list_worker()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'word_worker_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;
  if not exists (
    select 1 from public.import_jobs j
    where j.kind = 'admin_list' and j.status in ('queued', 'running') and j.run_after <= now()
      and (j.locked_at is null or j.locked_at < now() - interval '3 minutes')
  ) then
    return 0;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/analyze-list',
    body := '{"action": "work"}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    timeout_milliseconds := 5000);
  return 1;
end;
$$;

revoke all on function private.kick_list_worker() from public, anon, authenticated;

-- Lượt worker hết giờ giữa chừng (đã trả việc) gọi lượt mới ngay, không chờ pg_cron.
create function public.kick_list_worker_now()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.kick_list_worker();
$$;

revoke all on function public.kick_list_worker_now() from public, anon, authenticated;
grant execute on function public.kick_list_worker_now() to service_role;

select cron.schedule('list-worker', '* * * * *', 'select private.kick_list_worker()');

/* ---------- Bắt đầu / chạy lại: gọi worker ngay ---------- */

-- Như bản ở 20261023020000_admin_lists.sql; thêm: xóa kết quả của lần phân tích trước và gọi
-- worker ngay (không chờ pg_cron).
create or replace function public.start_list_analysis(p_list_id uuid, p_options jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_total integer;
  v_job uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select status into v_status from public.curated_lists where id = p_list_id for update;
  if v_status is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'review') then
    raise exception 'list_busy' using errcode = '55000';
  end if;
  select coalesce(sum(item_count), 0) into v_total
  from public.curated_list_sources where list_id = p_list_id;
  if not exists (select 1 from public.curated_list_sources where list_id = p_list_id) then
    raise exception 'no_sources' using errcode = '22023';
  end if;
  if p_options ? 'min_cefr' and p_options ->> 'min_cefr' not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then
    raise exception 'invalid_options' using errcode = '22023';
  end if;
  delete from public.curated_list_candidates where list_id = p_list_id;
  insert into public.import_jobs (user_id, kind, list_id, total, options)
  values (auth.uid(), 'admin_list', p_list_id, v_total, coalesce(p_options, '{}'))
  returning id into v_job;
  update public.curated_lists set status = 'processing' where id = p_list_id;
  perform private.kick_list_worker();
  return v_job;
end;
$$;

create or replace function public.retry_list_analysis(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  update public.import_jobs
  set status = 'queued', finished_at = null, attempts = 0, locked_at = null, run_after = now()
  where id = p_job_id and kind = 'admin_list' and status = 'failed';
  if not found then
    raise exception 'job_not_retryable' using errcode = '55000';
  end if;
  update public.curated_lists l set status = 'processing'
  from public.import_jobs j where j.id = p_job_id and l.id = j.list_id;
  perform private.kick_list_worker();
end;
$$;
