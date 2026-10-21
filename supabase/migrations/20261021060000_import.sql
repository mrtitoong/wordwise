-- Nhập từ file (Prompt 2.4b): file chỉ là danh sách từ muốn học + cách gom nhóm (tag); nội dung
-- từ luôn lấy từ kho. Cột nghĩa/ghi chú của file thành ghi chú riêng "Của bạn". Chỉ Premium.

/* ---------- Từ mới từ file: mang theo ghi chú riêng và tag ---------- */

alter table public.word_job_requests
  add column user_note text check (char_length(user_note) <= 500),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 10);

drop function public.request_word_job(uuid, text, text, text, uuid, text, text);

-- Như bản Prompt 2.4a, thêm: nhập file (input_method = 'csv') chỉ cho Premium; ghi chú riêng và
-- tag đi kèm để complete_word_job thêm vào sổ. Trả về thêm premium_required.
create function public.request_word_job(
  p_user_id uuid,
  p_language text,
  p_lemma text,
  p_pos text default null,
  p_notebook_id uuid default null,
  p_context_sentence text default null,
  p_input_method text default null,
  p_note text default null,
  p_tags text[] default '{}'
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
  v_tags text[] := coalesce(p_tags[1:10], '{}');
begin
  if p_input_method = 'csv' and v_plan <> 'premium' then
    return jsonb_build_object('job_id', null, 'status', null, 'limit_reached', false,
                              'premium_required', true, 'daily_limit', v_limit, 'plan', v_plan);
  end if;

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

  if v_job.id is not null and exists (
    select 1 from public.word_job_requests where job_id = v_job.id and user_id = p_user_id
  ) then
    if p_notebook_id is not null then
      update public.word_job_requests
      set notebook_id = p_notebook_id,
          context_sentence = coalesce(p_context_sentence, context_sentence),
          input_method = coalesce(p_input_method, input_method, 'typed'),
          user_note = coalesce(p_note, user_note),
          tags = case when cardinality(v_tags) > 0 then v_tags else tags end,
          added_at = coalesce(added_at, now())
      where job_id = v_job.id and user_id = p_user_id;
    end if;
    return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'limit_reached', false,
                              'premium_required', false, 'daily_limit', v_limit, 'plan', v_plan);
  end if;

  select count(*) into v_used from public.word_job_requests
  where user_id = p_user_id and created_at >= private.vn_day_start();
  if v_used >= v_limit then
    return jsonb_build_object('job_id', null, 'status', null, 'limit_reached', true,
                              'premium_required', false, 'daily_limit', v_limit, 'plan', v_plan);
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
    (job_id, user_id, notebook_id, context_sentence, input_method, user_note, tags, added_at)
  values (v_job.id, p_user_id, p_notebook_id, p_context_sentence,
          case when p_notebook_id is null then null else coalesce(p_input_method, 'typed') end,
          p_note, v_tags,
          case when p_notebook_id is null then null else now() end)
  on conflict do nothing;

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'limit_reached', false,
                            'premium_required', false, 'daily_limit', v_limit, 'plan', v_plan);
end;
$$;

drop function private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz);

-- Như bản 2.4a, thêm tag cho mục trong sổ và ghi chú riêng vào tab Nghĩa (user_additions.meaning,
-- định dạng src/lib/words/user-additions.ts), không thêm trùng ghi chú đã có.
create function private.add_word_to_notebook(
  p_user_id uuid,
  p_word_id uuid,
  p_notebook_id uuid,
  p_context_sentence text,
  p_input_method text,
  p_added_at timestamptz,
  p_note text default null,
  p_tags text[] default '{}'
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
  v_note text := nullif(btrim(p_note), '');
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

  if v_note is not null then
    update public.user_words
    set user_additions = jsonb_set(
      user_additions,
      '{meaning}',
      coalesce(user_additions -> 'meaning', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'text', left(v_note, 500)))
    )
    where id = v_user_word
      and not coalesce(user_additions -> 'meaning', '[]'::jsonb)
        @> jsonb_build_array(jsonb_build_object('text', left(v_note, 500)));
  end if;

  insert into public.notebook_entries
    (id, user_id, notebook_id, user_word_id, input_method, context_sentence, source, tags, added_at)
  values (
    extensions.uuid_generate_v5(v_ns, 'entry:' || p_notebook_id || ':' || v_user_word),
    p_user_id, p_notebook_id, v_user_word, coalesce(p_input_method, 'typed'),
    p_context_sentence, 'pending', coalesce(p_tags[1:10], '{}'), v_added)
  on conflict (id) do update set deleted_at = null
    where public.notebook_entries.deleted_at is not null;

  insert into public.cards (id, user_id, user_word_id, skill)
  values (extensions.uuid_generate_v5(v_ns, 'card:' || v_user_word || ':meaning'),
          p_user_id, v_user_word, 'meaning')
  on conflict (id) do update set deleted_at = null
    where public.cards.deleted_at is not null;
end;
$$;

revoke all on function
  private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz, text, text[])
  from public, anon, authenticated;
grant execute on function
  private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz, text, text[])
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
      v_request.context_sentence, v_request.input_method, v_request.added_at,
      v_request.user_note, v_request.tags);
  end loop;
end;
$$;

revoke all on function
  public.request_word_job(uuid, text, text, text, uuid, text, text, text, text[])
from public, anon, authenticated;
grant execute on function
  public.request_word_job(uuid, text, text, text, uuid, text, text, text, text[])
to service_role;

/* ---------- Tiến độ nhập file ---------- */

-- App ghi tiến độ việc nhập của chính người đó (đọc file và thêm từ chạy trong trình duyệt).
grant update (status, total, done, errors) on public.import_jobs to authenticated;

create policy "import_jobs: cập nhật tiến độ của mình"
  on public.import_jobs for update to authenticated
  using (user_id = (select auth.uid()) and kind = 'csv')
  with check (user_id = (select auth.uid()) and kind = 'csv');
