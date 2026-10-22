-- Thêm từ bằng chụp ảnh (Prompt 2.6): đọc chữ trên ảnh (OCR) chỉ cho Premium, 30 ảnh/người/ngày;
-- ảnh chụp giữ làm ngữ cảnh (tùy chọn) đi theo từ mới tới lúc máy chủ thêm vào sổ; gợi ý sửa
-- chính tả cho chữ máy đọc nhầm.

create extension if not exists fuzzystrmatch with schema extensions;

/* ---------- Giới hạn lượt đọc ảnh ---------- */

insert into private.settings (key, value, note) values
  ('user_daily_ocr', 30, 'Số ảnh đọc chữ (OCR) mỗi người mỗi ngày (chỉ Premium)')
on conflict (key) do nothing;

alter table public.usage_events drop constraint usage_events_kind_check;
alter table public.usage_events
  add constraint usage_events_kind_check check (kind in ('transcribe', 'reverse_ai', 'ocr'));

/* ---------- Ảnh ngữ cảnh ---------- */

-- Ảnh gốc nơi gặp từ chỉ trỏ vào thư mục ảnh của chính người đó (giống custom_image_url).
alter table public.notebook_entries
  add constraint notebook_entries_context_image_own check (
    context_image_url is null
    or context_image_url like 'storage://user-images/' || user_id::text || '/%'
  );

comment on column public.notebook_entries.context_image_url is
  'Ảnh gốc nơi gặp từ (ảnh chụp người dùng chọn giữ): storage://user-images/{user_id}/…';

alter table public.word_job_requests
  add column context_image_url text,
  add constraint word_job_requests_context_image_own check (
    context_image_url is null
    or context_image_url like 'storage://user-images/' || user_id::text || '/%'
  );

/* ---------- Xếp việc tạo từ mới: thêm ảnh ngữ cảnh, ảnh chụp chỉ cho Premium ---------- */

drop function public.request_word_job(uuid, text, text, text, uuid, text, text, text, text[]);

-- Như bản Prompt 2.4b, thêm: nhập từ ảnh (input_method = 'photo') cũng chỉ cho Premium; ảnh ngữ
-- cảnh đi kèm để complete_word_job gắn vào mục trong sổ.
create function public.request_word_job(
  p_user_id uuid,
  p_language text,
  p_lemma text,
  p_pos text default null,
  p_notebook_id uuid default null,
  p_context_sentence text default null,
  p_input_method text default null,
  p_note text default null,
  p_tags text[] default '{}',
  p_context_image_url text default null
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
  v_image text := case
    when p_context_image_url like 'storage://user-images/' || p_user_id::text || '/%'
      then p_context_image_url
  end;
begin
  if p_input_method in ('csv', 'photo') and v_plan <> 'premium' then
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
          context_image_url = coalesce(v_image, context_image_url),
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
    (job_id, user_id, notebook_id, context_sentence, context_image_url, input_method, user_note,
     tags, added_at)
  values (v_job.id, p_user_id, p_notebook_id, p_context_sentence,
          case when p_notebook_id is null then null else v_image end,
          case when p_notebook_id is null then null else coalesce(p_input_method, 'typed') end,
          p_note, v_tags,
          case when p_notebook_id is null then null else now() end)
  on conflict do nothing;

  return jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'limit_reached', false,
                            'premium_required', false, 'daily_limit', v_limit, 'plan', v_plan);
end;
$$;

revoke all on function
  public.request_word_job(uuid, text, text, text, uuid, text, text, text, text[], text)
from public, anon, authenticated;
grant execute on function
  public.request_word_job(uuid, text, text, text, uuid, text, text, text, text[], text)
to service_role;

drop function private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz, text, text[]);

-- Như bản 2.4b, thêm ảnh ngữ cảnh của mục trong sổ.
create function private.add_word_to_notebook(
  p_user_id uuid,
  p_word_id uuid,
  p_notebook_id uuid,
  p_context_sentence text,
  p_input_method text,
  p_added_at timestamptz,
  p_note text default null,
  p_tags text[] default '{}',
  p_context_image_url text default null
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
    (id, user_id, notebook_id, user_word_id, input_method, context_sentence, context_image_url,
     source, tags, added_at)
  values (
    extensions.uuid_generate_v5(v_ns, 'entry:' || p_notebook_id || ':' || v_user_word),
    p_user_id, p_notebook_id, v_user_word, coalesce(p_input_method, 'typed'),
    p_context_sentence, p_context_image_url, 'pending', coalesce(p_tags[1:10], '{}'), v_added)
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
  private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz, text, text[], text)
  from public, anon, authenticated;
grant execute on function
  private.add_word_to_notebook(uuid, uuid, uuid, text, text, timestamptz, text, text[], text)
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
      v_request.user_note, v_request.tags, v_request.context_image_url);
  end loop;
end;
$$;

/* ---------- Gợi ý sửa chính tả ---------- */

-- Mỗi chữ (OCR có thể đọc nhầm "verdlct") → từ trong kho gần nhất (sai tối đa 1 ký tự với chữ
-- ngắn, 2 ký tự với chữ từ 7 ký tự), thông dụng trước. Chữ đã đúng một từ trong kho thì bỏ qua.
-- Trả về [{ term, lemma }]. Người dùng đã đăng nhập mới gọi được (chỉ dùng ở tab Ảnh).
create function public.suggest_spellings(p_terms text[], p_language text default 'en')
returns jsonb
language sql
stable
set search_path = ''
as $$
  with terms as (
    select distinct lower(btrim(t)) as term
    from unnest(p_terms[1:100]) t
    where char_length(btrim(t)) between 3 and 30
  ),
  candidates as (
    select t.term, w.lemma,
      extensions.levenshtein_less_equal(t.term, lower(w.lemma), 2) as distance,
      w.frequency_rank
    from terms t
    join public.words w
      on w.language = p_language
      and not w.is_hidden
      and abs(char_length(w.lemma) - char_length(t.term)) <= 2
    where not exists (
      select 1 from public.words k
      where k.language = p_language and lower(k.lemma) = t.term and not k.is_hidden
    )
  ),
  best as (
    select distinct on (term) term, lemma
    from candidates
    where distance between 1 and case when char_length(term) >= 7 then 2 else 1 end
    order by term, distance, frequency_rank nulls last, lemma
  )
  select coalesce(jsonb_agg(jsonb_build_object('term', term, 'lemma', lemma) order by term),
                  '[]'::jsonb)
  from best;
$$;

revoke all on function public.suggest_spellings(text[], text) from public, anon;
grant execute on function public.suggest_spellings(text[], text) to authenticated;
