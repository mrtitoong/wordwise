-- Prompt 7.3: duyệt và xuất bản danh sách có chủ đích.
--
--  - curated_list_items là bản làm việc của Admin (kết quả phân tích + chỉnh tay), mỗi mục có cờ
--    accepted. Xuất bản sao các mục sang curated_list_release_items (một phiên bản), người học đọc
--    bản đã xuất bản, không đọc bản làm việc.
--  - Sửa danh sách đã xuất bản: "Sửa" đưa danh sách về Chờ duyệt (bản nháp riêng); người học vẫn
--    dùng phiên bản mới nhất. Xuất bản lại → version + 1, ghi từ thêm/bỏ so với bản trước.
--  - Admin sửa nội dung từ dùng chung: admin_save_word() ghi đè tại chỗ (giữ id nghĩa), đặt
--    reviewed = true và content_updated_at để máy người học tải lại bản mới khi đồng bộ.
--  - Thống kê danh sách: admin_list_stats() chỉ trả số tổng hợp.

/* ---------- Bản làm việc: cờ đã chấp nhận ---------- */

alter table public.curated_list_items
  add column accepted boolean not null default false;

comment on column public.curated_list_items.accepted is
  'Admin đã duyệt mục này. Chỉ xuất bản được khi mọi mục đã chấp nhận.';

/* ---------- Phiên bản đã xuất bản ---------- */

create table public.curated_list_releases (
  list_id uuid not null references public.curated_lists (id) on delete cascade,
  version integer not null check (version >= 1),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  word_count integer not null check (word_count >= 0),
  -- Nghĩa thêm/bỏ so với phiên bản trước (phiên bản 1: mọi nghĩa là "thêm").
  added_sense_ids uuid[] not null default '{}',
  removed_sense_ids uuid[] not null default '{}',
  primary key (list_id, version)
);

create table public.curated_list_release_items (
  list_id uuid not null,
  version integer not null,
  sense_id uuid not null references public.word_senses (id) on delete restrict,
  item_order integer not null check (item_order >= 0),
  subtopic text,
  context_sentence text,
  -- Giữ lại để "Hủy bản nháp" khôi phục đúng bản làm việc (người học không cần).
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  admin_note text,
  primary key (list_id, version, sense_id),
  foreign key (list_id, version)
    references public.curated_list_releases (list_id, version) on delete cascade
);

create index curated_list_release_items_order_idx
  on public.curated_list_release_items (list_id, version, item_order);
create index curated_list_release_items_sense_idx
  on public.curated_list_release_items (sense_id);

alter table public.curated_list_releases enable row level security;
alter table public.curated_list_release_items enable row level security;

-- Phiên bản chỉ có khi đã xuất bản nên ai cũng đọc được (Thư viện, cả khách). Chỉ ghi qua hàm.
create policy "curated_list_releases: mọi người đọc"
  on public.curated_list_releases for select to anon, authenticated using (true);
create policy "curated_list_release_items: mọi người đọc"
  on public.curated_list_release_items for select to anon, authenticated using (true);
revoke insert, update, delete on public.curated_list_releases, public.curated_list_release_items
  from anon, authenticated;

-- Danh sách đã từng xuất bản vẫn hiện với người học khi Admin đang sửa bản nháp.
drop policy "curated_lists: đọc bản đã xuất bản, admin đọc tất cả" on public.curated_lists;
create policy "curated_lists: đọc bản đã xuất bản, admin đọc tất cả"
  on public.curated_lists for select to anon, authenticated
  using (status = 'published' or published_at is not null or (select private.is_admin()));

-- Bản làm việc chỉ Admin đọc; người học đọc curated_list_release_items.
drop policy "curated_list_items: đọc mục của danh sách đã xuất bản, admin đọc tất cả"
  on public.curated_list_items;
create policy "curated_list_items: admin đọc"
  on public.curated_list_items for select to authenticated
  using ((select private.is_admin()));

/* ---------- Nội dung từ do Admin sửa ---------- */

alter table public.words add column content_updated_at timestamptz;

comment on column public.words.content_updated_at is
  'Lần cuối Admin sửa nội dung (không tính audio/ảnh). Máy người học đã lưu từ này thì tải lại.';

create index words_content_updated_idx on public.words (content_updated_at)
  where content_updated_at is not null;

/* ---------- Phân tích lại giữ cờ đã chấp nhận ---------- */

-- Như bản Prompt 7.2, thêm: nghĩa đã được chấp nhận ở bản làm việc cũ vẫn giữ accepted.
create or replace function public.finish_list_analysis(p_job_id uuid, p_summary jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_list_id uuid;
  v_count integer;
  v_accepted uuid[];
begin
  select list_id into v_list_id from public.import_jobs
  where id = p_job_id and kind = 'admin_list' and status = 'running'
  for update;
  if v_list_id is null then
    raise exception 'job_not_running' using errcode = '55000';
  end if;

  select coalesce(array_agg(sense_id), '{}') into v_accepted
  from public.curated_list_items where list_id = v_list_id and accepted;

  delete from public.curated_list_items where list_id = v_list_id;
  insert into public.curated_list_items (
    list_id, sense_id, item_order, subtopic, warnings, admin_note, context_sentence, accepted
  )
  select v_list_id, c.sense_id,
    (row_number() over (order by c.item_order, c.position))::integer - 1,
    c.subtopic, c.warnings, left(c.note, 1000), c.context_sentence,
    c.sense_id = any (v_accepted)
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

/* ---------- Thao tác duyệt ---------- */

-- Khóa danh sách và kiểm tra đang ở trạng thái sửa được (Nháp/Chờ duyệt).
create function private.lock_editable_list(p_list_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select status into v_status from public.curated_lists where id = p_list_id for update;
  if v_status is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'review') then
    raise exception 'list_locked' using errcode = '55000';
  end if;
end;
$$;

-- Đặt lại thứ tự: p_item_ids là toàn bộ mục của danh sách theo thứ tự mới.
create function public.admin_reorder_list_items(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  perform private.lock_editable_list(p_list_id);
  select count(*) into v_total from public.curated_list_items where list_id = p_list_id;
  if cardinality(p_item_ids) <> v_total
     or (select count(distinct i) from unnest(p_item_ids) i) <> v_total
     or exists (
       select 1 from unnest(p_item_ids) i
       where not exists (
         select 1 from public.curated_list_items c where c.id = i and c.list_id = p_list_id
       )
     ) then
    raise exception 'items_mismatch' using errcode = '22023';
  end if;
  update public.curated_list_items c
  set item_order = o.ord - 1
  from unnest(p_item_ids) with ordinality as o (id, ord)
  where c.id = o.id and c.item_order is distinct from o.ord - 1;
end;
$$;

-- Bỏ một mục, đánh số lại các mục sau.
create function public.admin_remove_list_item(p_list_id uuid, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_editable_list(p_list_id);
  delete from public.curated_list_items where id = p_item_id and list_id = p_list_id;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  update public.curated_list_items c
  set item_order = o.ord - 1
  from (
    select id, row_number() over (order by item_order, created_at) as ord
    from public.curated_list_items where list_id = p_list_id
  ) o
  where c.id = o.id and c.item_order <> o.ord - 1;
end;
$$;

-- Đổi sang nghĩa khác của cùng từ. Bỏ cảnh báo về cách chọn nghĩa (Admin đã chọn tay).
create function public.admin_set_item_sense(p_list_id uuid, p_item_id uuid, p_sense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  perform private.lock_editable_list(p_list_id);
  select sense_id into v_old from public.curated_list_items
  where id = p_item_id and list_id = p_list_id;
  if v_old is null then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if v_old = p_sense_id then
    return;
  end if;
  if not exists (
    select 1 from public.word_senses a join public.word_senses b on a.word_id = b.word_id
    where a.id = v_old and b.id = p_sense_id
  ) then
    raise exception 'sense_of_other_word' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.curated_list_items where list_id = p_list_id and sense_id = p_sense_id
  ) then
    raise exception 'sense_already_in_list' using errcode = '23505';
  end if;
  update public.curated_list_items
  set sense_id = p_sense_id,
      warnings = coalesce((
        select jsonb_agg(w) from jsonb_array_elements(warnings) w
        where w ->> 'code' not in ('no_context', 'low_confidence')
           or (w ->> 'code' = 'low_confidence' and w ->> 'source' = 'content')
      ), '[]')
  where id = p_item_id;
end;
$$;

-- Chấp nhận/bỏ chấp nhận. p_item_ids null → mọi mục không có cảnh báo. Trả số mục đã đổi.
create function public.admin_accept_list_items(p_list_id uuid, p_item_ids uuid[], p_accepted boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.lock_editable_list(p_list_id);
  update public.curated_list_items
  set accepted = p_accepted
  where list_id = p_list_id
    and accepted <> p_accepted
    and (case when p_item_ids is null then warnings = '[]'::jsonb else id = any (p_item_ids) end);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/* ---------- Xuất bản, sửa bản đã xuất bản ---------- */

-- Xuất bản bản làm việc thành phiên bản mới. Trả số phiên bản.
create function public.admin_publish_list(p_list_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_total integer;
  v_pending integer;
  v_prev integer;
  v_version integer;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select status into v_status from public.curated_lists where id = p_list_id for update;
  if v_status is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'review' then
    raise exception 'list_not_in_review' using errcode = '55000';
  end if;
  select count(*), count(*) filter (where not accepted) into v_total, v_pending
  from public.curated_list_items where list_id = p_list_id;
  if v_total = 0 then
    raise exception 'list_empty' using errcode = '22023';
  end if;
  if v_pending > 0 then
    raise exception 'items_not_accepted' using errcode = '22023';
  end if;

  select max(version) into v_prev from public.curated_list_releases where list_id = p_list_id;
  v_version := coalesce(v_prev, 0) + 1;

  insert into public.curated_list_releases (
    list_id, version, published_by, word_count, added_sense_ids, removed_sense_ids
  )
  select p_list_id, v_version, auth.uid(), v_total,
    coalesce((
      select array_agg(i.sense_id order by i.item_order) from public.curated_list_items i
      where i.list_id = p_list_id and not exists (
        select 1 from public.curated_list_release_items r
        where r.list_id = p_list_id and r.version = v_prev and r.sense_id = i.sense_id
      )
    ), '{}'),
    coalesce((
      select array_agg(r.sense_id order by r.item_order) from public.curated_list_release_items r
      where r.list_id = p_list_id and r.version = v_prev and not exists (
        select 1 from public.curated_list_items i
        where i.list_id = p_list_id and i.sense_id = r.sense_id
      )
    ), '{}');

  insert into public.curated_list_release_items (
    list_id, version, sense_id, item_order, subtopic, context_sentence, warnings, admin_note
  )
  select p_list_id, v_version, sense_id, item_order, subtopic, context_sentence, warnings, admin_note
  from public.curated_list_items where list_id = p_list_id;

  update public.curated_lists
  set status = 'published', version = v_version, published_at = coalesce(published_at, now())
  where id = p_list_id;
  return v_version;
end;
$$;

-- "Sửa" danh sách đã xuất bản: mở bản nháp (Chờ duyệt), người học vẫn dùng phiên bản cũ.
create function public.admin_open_list_draft(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  update public.curated_lists set status = 'review'
  where id = p_list_id and status = 'published';
  if not found then
    raise exception 'list_not_published' using errcode = '55000';
  end if;
end;
$$;

-- Hủy bản nháp: bản làm việc trở về đúng phiên bản đã xuất bản mới nhất.
create function public.admin_discard_list_draft(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.lock_editable_list(p_list_id);
  select max(version) into v_version from public.curated_list_releases where list_id = p_list_id;
  if v_version is null then
    raise exception 'list_not_published' using errcode = '55000';
  end if;
  delete from public.curated_list_items where list_id = p_list_id;
  insert into public.curated_list_items (
    list_id, sense_id, item_order, subtopic, context_sentence, warnings, admin_note, accepted
  )
  select p_list_id, sense_id, item_order, subtopic, context_sentence, warnings, admin_note, true
  from public.curated_list_release_items where list_id = p_list_id and version = v_version;
  update public.curated_lists set status = 'published', version = v_version where id = p_list_id;
end;
$$;

/* ---------- Admin sửa nội dung từ dùng chung ---------- */

-- Ghi đè nội dung một từ (đã kiểm tra bằng Zod ở server action). Giữ nguyên id và số nghĩa
-- (user_words, danh sách trỏ vào nghĩa). Audio, ảnh, loại từ, chữ của từ không đổi ở đây.
create function public.admin_save_word(
  p_word_id uuid,
  p_word jsonb,
  p_senses jsonb,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid[];
  v_given uuid[];
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_existing
  from public.word_senses where word_id = p_word_id;
  if cardinality(v_existing) = 0 then
    raise exception 'word_not_found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg((s ->> 'id')::uuid order by (s ->> 'id')::uuid), '{}') into v_given
  from jsonb_array_elements(p_senses) s;
  if v_given <> v_existing or (
    select coalesce(array_agg((d ->> 'sense_id')::uuid order by (d ->> 'sense_id')::uuid), '{}')
    from jsonb_array_elements(p_details) d
  ) <> v_existing then
    raise exception 'senses_mismatch' using errcode = '22023';
  end if;

  update public.words w
  set ipa_us = r.ipa_us, ipa_uk = r.ipa_uk, cefr = r.cefr, register = r.register,
      forms = r.forms, details = r.details, reviewed = true, content_updated_at = now()
  from jsonb_populate_record(null::public.words, p_word) r
  where w.id = p_word_id;

  update public.word_senses s
  set definition_en = r.definition_en, meaning_vi = r.meaning_vi, image_query = r.image_query
  from jsonb_populate_recordset(null::public.word_senses, p_senses) r
  where s.id = r.id and s.word_id = p_word_id;

  update public.word_details d
  set examples = r.examples, synonyms = r.synonyms, antonyms = r.antonyms,
      collocations = r.collocations, idioms = r.idioms, common_mistakes = r.common_mistakes
  from jsonb_populate_recordset(null::public.word_details, p_details) r
  where d.sense_id = r.sense_id;
end;
$$;

/* ---------- Thống kê danh sách (chỉ số tổng hợp) ---------- */

-- Theo phiên bản xuất bản mới nhất. Người học = có sổ tay (chưa xóa) tạo từ danh sách này.
--  completed_learners: đã bắt đầu học (thẻ Nghĩa đã ôn) mọi từ của danh sách.
--  avg_started: tỉ lệ từ đã bắt đầu học, trung bình theo người.
--  avg_known: tỉ lệ từ "Đã thuộc" trở lên (thẻ Nghĩa ở Review, S ≥ 7 ngày), trung bình theo người.
--  top_forgotten: 10 nghĩa có nhiều lượt Quên nhất trong 30 ngày.
create function public.admin_list_stats(p_list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_total integer;
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select max(version) into v_version from public.curated_list_releases where list_id = p_list_id;
  select count(*) into v_total from public.curated_list_release_items
  where list_id = p_list_id and version = v_version;

  with list_senses as (
    select sense_id from public.curated_list_release_items
    where list_id = p_list_id and version = v_version
  ),
  learners as (
    select distinct n.user_id from public.notebooks n
    where n.source_list_id = p_list_id and n.deleted_at is null
  ),
  learner_words as (
    select u.id, u.user_id, u.sense_id from public.user_words u
    join learners l on l.user_id = u.user_id
    join list_senses s on s.sense_id = u.sense_id
    where u.deleted_at is null
  ),
  meaning_cards as (
    select w.user_id, w.sense_id, c.id as card_id, c.state, c.stability
    from learner_words w
    join public.cards c on c.user_word_id = w.id and c.skill = 'meaning' and c.deleted_at is null
  ),
  per_user as (
    select l.user_id,
      count(m.card_id) filter (where m.state > 0) as started,
      count(m.card_id) filter (where m.state = 2 and m.stability >= 7) as known
    from learners l left join meaning_cards m on m.user_id = l.user_id
    group by l.user_id
  ),
  forgotten as (
    select w.sense_id, count(*) as lapses, count(distinct r.user_id) as learners
    from public.review_logs r
    join public.cards c on c.id = r.card_id
    join learner_words w on w.id = c.user_word_id
    where r.rating = 1 and r.reviewed_at >= now() - interval '30 days'
    group by w.sense_id
    order by count(*) desc, w.sense_id
    limit 10
  )
  select jsonb_build_object(
    'version', v_version,
    'word_count', v_total,
    'learners', (select count(*) from per_user),
    'completed_learners',
      (select count(*) from per_user where v_total > 0 and started >= v_total),
    'avg_started',
      (select round(avg(least(started, v_total)::numeric / v_total), 4) from per_user
       where v_total > 0),
    'avg_known',
      (select round(avg(least(known, v_total)::numeric / v_total), 4) from per_user
       where v_total > 0),
    'top_forgotten', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sense_id', f.sense_id, 'word_id', ws.word_id, 'lemma', wd.lemma, 'pos', wd.pos,
        'meaning_vi', ws.meaning_vi, 'lapses', f.lapses, 'learners', f.learners
      ) order by f.lapses desc, f.sense_id)
      from forgotten f
      join public.word_senses ws on ws.id = f.sense_id
      join public.words wd on wd.id = ws.word_id
    ), '[]')
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function
  private.lock_editable_list(uuid),
  public.admin_reorder_list_items(uuid, uuid[]),
  public.admin_remove_list_item(uuid, uuid),
  public.admin_set_item_sense(uuid, uuid, uuid),
  public.admin_accept_list_items(uuid, uuid[], boolean),
  public.admin_publish_list(uuid),
  public.admin_open_list_draft(uuid),
  public.admin_discard_list_draft(uuid),
  public.admin_save_word(uuid, jsonb, jsonb, jsonb),
  public.admin_list_stats(uuid)
from public, anon;
grant execute on function
  public.admin_reorder_list_items(uuid, uuid[]),
  public.admin_remove_list_item(uuid, uuid),
  public.admin_set_item_sense(uuid, uuid, uuid),
  public.admin_accept_list_items(uuid, uuid[], boolean),
  public.admin_publish_list(uuid),
  public.admin_open_list_draft(uuid),
  public.admin_discard_list_draft(uuid),
  public.admin_save_word(uuid, jsonb, jsonb, jsonb),
  public.admin_list_stats(uuid)
to authenticated;
