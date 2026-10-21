-- Sổ tay và thêm từ bằng gõ (Prompt 2.4a): gói Free/Premium, giới hạn từ mới theo gói, tự thêm
-- từ vào sổ khi nội dung tạo xong, mở dần từ "Sắp học", tìm từ theo tiền tố.

create extension if not exists "uuid-ossp" with schema extensions;

/* ---------- Gói Free / Premium (chưa thu tiền: admin bật bằng tay) ---------- */

alter table public.profiles
  add column plan text not null default 'free' check (plan in ('free', 'premium')),
  add column plan_updated_at timestamptz;

comment on column public.profiles.plan is
  'Gói dịch vụ. Premium: tạo nhiều từ mới hơn mỗi ngày, nhập file. Người dùng không tự sửa được.';

-- Người dùng chỉ được sửa display_name (Prompt 1.2) nên cột plan không cần quyền thêm.

insert into private.settings (key, value, note) values
  ('premium_daily_new_words', 300, 'Số từ mới (chưa có trong kho) mỗi người Premium được yêu cầu mỗi ngày')
on conflict (key) do nothing;

/** Giới hạn từ mới mỗi ngày theo gói của người dùng. */
create function private.daily_new_word_limit(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when (select plan from public.profiles where user_id = p_user_id) = 'premium'
      then private.setting('premium_daily_new_words')
    else private.setting('user_daily_new_words')
  end;
$$;

revoke all on function private.daily_new_word_limit(uuid) from public, anon, authenticated;
grant execute on function private.daily_new_word_limit(uuid) to service_role;

/* ---------- Sổ tay ---------- */

-- Tên sổ chỉ cần khác nhau trong UI; ràng buộc unique ở server làm kẹt đồng bộ khi hai máy
-- offline cùng tạo một tên, và chặn tạo lại tên của sổ đã xóa mềm.
alter table public.notebooks drop constraint notebooks_user_id_name_key;

-- Tag của từng từ trong sổ (nhập từ file có cột tags, lọc trong chi tiết sổ).
alter table public.notebook_entries
  add column tags text[] not null default '{}' check (cardinality(tags) <= 10);

-- Ngày từ được mở để học (mở dần theo daily_new_limit); null khi còn ở hàng "Sắp học".
alter table public.user_words add column introduced_at timestamptz;
update public.user_words set introduced_at = added_at where status = 'learning';

/* ---------- Từ chưa có trong kho: lưu đích đến, thêm vào sổ khi tạo xong ---------- */

alter table public.word_job_requests
  add column notebook_id uuid,
  add column context_sentence text check (char_length(context_sentence) <= 500),
  add column input_method text check (input_method in ('typed', 'voice', 'photo', 'csv', 'list')),
  add column added_at timestamptz;

comment on column public.word_job_requests.notebook_id is
  'Sổ sẽ nhận từ khi nội dung tạo xong (null: chỉ xem thẻ, không thêm vào sổ).';

drop function public.request_word_job(uuid, text, text, text);

-- Xếp việc cho một người dùng: gộp với việc đang chờ của cùng từ, kiểm tra giới hạn ngày theo
-- gói. Có p_notebook_id thì ghi lại để complete_word_job tự thêm từ vào sổ.
-- Trả về { job_id, status, limit_reached, daily_limit, plan }.
create function public.request_word_job(
  p_user_id uuid,
  p_language text,
  p_lemma text,
  p_pos text default null,
  p_notebook_id uuid default null,
  p_context_sentence text default null,
  p_input_method text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit integer := private.daily_new_word_limit(p_user_id);
  v_plan text := coalesce((select plan from public.profiles where user_id = p_user_id), 'free');
  v_job public.word_jobs;
  v_used integer;
begin
  -- Sổ phải là của người này (chưa xóa), nếu không thì bỏ qua đích đến.
  if p_notebook_id is not null and not exists (
    select 1 from public.notebooks
    where id = p_notebook_id and user_id = p_user_id and deleted_at is null
  ) then
    p_notebook_id := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('word_job_requests:' || p_user_id::text, 0));

  select * into v_job from public.word_jobs
  where language = p_language and lemma = p_lemma and pos is not distinct from p_pos
    and status in ('queued', 'running');

  -- Đã yêu cầu việc này rồi → không tính thêm; cập nhật đích đến nếu có.
  if v_job.id is not null and exists (
    select 1 from public.word_job_requests where job_id = v_job.id and user_id = p_user_id
  ) then
    if p_notebook_id is not null then
      update public.word_job_requests
      set notebook_id = p_notebook_id,
          context_sentence = coalesce(p_context_sentence, context_sentence),
          input_method = coalesce(p_input_method, input_method, 'typed'),
          added_at = coalesce(added_at, now())
      where job_id = v_job.id and user_id = p_user_id;
    end if;
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
                              'limit_reached', false, 'daily_limit', v_limit, 'plan', v_plan);
  end if;

  select count(*) into v_used from public.word_job_requests
  where user_id = p_user_id and created_at >= private.vn_day_start();
  if v_used >= v_limit then
    return jsonb_build_object('job_id', null, 'status', null,
                              'limit_reached', true, 'daily_limit', v_limit, 'plan', v_plan);
  end if;

  if v_job.id is null then
    insert into public.word_jobs (language, lemma, pos, source)
    values (p_language, p_lemma, p_pos, 'user')
    on conflict (language, lemma, (coalesce(pos, ''))) where status in ('queued', 'running')
    do nothing
    returning * into v_job;
    if v_job.id is null then
      select * into v_job from public.word_jobs
      where language = p_language and lemma = p_lemma and pos is not distinct from p_pos
        and status in ('queued', 'running');
    end if;
  elsif v_job.source = 'bulk' then
    update public.word_jobs set source = 'user', run_after = least(run_after, now())
    where id = v_job.id;
  end if;

  insert into public.word_job_requests
    (job_id, user_id, notebook_id, context_sentence, input_method, added_at)
  values (v_job.id, p_user_id, p_notebook_id, p_context_sentence,
          case when p_notebook_id is null then null else coalesce(p_input_method, 'typed') end,
          case when p_notebook_id is null then null else now() end)
  on conflict do nothing;

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
                            'limit_reached', false, 'daily_limit', v_limit, 'plan', v_plan);
end;
$$;

/**
 * Thêm nghĩa phổ biến nhất (sense_order nhỏ nhất) của một từ vào sổ, kèm thẻ ôn "meaning".
 * ID tính giống máy khách (UUID v5, src/lib/db/ids.ts) để đồng bộ là gộp cùng dòng.
 * Từ đã có trong kho của người đó thì giữ nguyên lịch ôn, chỉ gắn thêm vào sổ.
 */
create function private.add_word_to_notebook(
  p_user_id uuid,
  p_word_id uuid,
  p_notebook_id uuid,
  p_context_sentence text,
  p_input_method text,
  p_added_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ns constant uuid := '6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f7a';
  v_sense uuid;
  v_user_word uuid;
  v_added timestamptz := coalesce(p_added_at, now());
begin
  if not exists (
    select 1 from public.notebooks
    where id = p_notebook_id and user_id = p_user_id and deleted_at is null
  ) then
    return;
  end if;

  select id into v_sense from public.word_senses
  where word_id = p_word_id order by sense_order limit 1;
  if v_sense is null then
    return;
  end if;

  v_user_word := extensions.uuid_generate_v5(v_ns, 'user_word:' || p_user_id || ':' || v_sense);

  insert into public.user_words (id, user_id, sense_id, status, added_at)
  values (v_user_word, p_user_id, v_sense, 'queued', v_added)
  on conflict (id) do update set deleted_at = null
    where public.user_words.deleted_at is not null;

  insert into public.notebook_entries
    (id, user_id, notebook_id, user_word_id, input_method, context_sentence, source, added_at)
  values (
    extensions.uuid_generate_v5(v_ns, 'entry:' || p_notebook_id || ':' || v_user_word),
    p_user_id, p_notebook_id, v_user_word, coalesce(p_input_method, 'typed'),
    p_context_sentence, 'pending', v_added)
  on conflict (id) do update set deleted_at = null
    where public.notebook_entries.deleted_at is not null;

  insert into public.cards (id, user_id, user_word_id, skill)
  values (extensions.uuid_generate_v5(v_ns, 'card:' || v_user_word || ':meaning'),
          p_user_id, v_user_word, 'meaning')
  on conflict (id) do update set deleted_at = null
    where public.cards.deleted_at is not null;
end;
$$;

revoke all on function private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz)
  to service_role;

create or replace function public.complete_word_job(p_job_id uuid, p_word_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_request public.word_job_requests;
begin
  update public.word_jobs
  set status = 'done', word_id = p_word_id, finished_at = now(), locked_at = null,
      last_error = null
  where id = p_job_id;

  for v_request in
    select * from public.word_job_requests where job_id = p_job_id and notebook_id is not null
  loop
    perform private.add_word_to_notebook(v_request.user_id, p_word_id, v_request.notebook_id,
      v_request.context_sentence, v_request.input_method, v_request.added_at);
  end loop;
end;
$$;

revoke all on function
  public.request_word_job(uuid, text, text, text, uuid, text, text),
  public.complete_word_job(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.request_word_job(uuid, text, text, text, uuid, text, text),
  public.complete_word_job(uuid, uuid)
to service_role;

/* ---------- Gợi ý khi gõ: tìm từ theo tiền tố ---------- */

create index words_lemma_prefix_idx on public.words (language, lower(lemma) text_pattern_ops)
  where not is_hidden;

-- Trả tối đa p_limit từ bắt đầu bằng p_prefix (không phân biệt hoa thường), từ khớp đúng và
-- thông dụng trước, kèm các nghĩa để chọn ngay.
create function public.search_words(p_prefix text, p_language text default 'en', p_limit integer default 8)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(btrim(p_prefix)) as prefix
  ),
  matched as (
    select w.*, row_number() over (
      order by (lower(w.lemma) = q.prefix) desc, w.frequency_rank nulls last,
        char_length(w.lemma), w.lemma
    ) as rn
    from public.words w, q
    where char_length(q.prefix) between 1 and 64
      and w.language = p_language
      and not w.is_hidden
      and lower(w.lemma) like replace(replace(replace(q.prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by rn
    limit least(greatest(p_limit, 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'lemma', m.lemma,
    'pos', m.pos,
    'cefr', m.cefr,
    'senses', (
      select jsonb_agg(jsonb_build_object('id', s.id, 'meaning_vi', s.meaning_vi) order by s.sense_order)
      from public.word_senses s where s.word_id = m.id
    )
  ) order by m.rn), '[]'::jsonb)
  from matched m;
$$;

grant execute on function public.search_words(text, text, integer) to anon, authenticated;
