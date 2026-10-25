-- Prompt 7.4a: Thư viện (danh sách đã xuất bản) và sổ học theo danh sách.

/* ---------- Sổ tay theo danh sách ---------- */

-- Phiên bản danh sách người học đã nhận (thêm vào sổ, hoặc bấm Nhận/Bỏ qua khi có bản mới).
alter table public.notebooks
  add column source_list_version integer
    check (source_list_version is null or source_list_version >= 1);

comment on column public.notebooks.source_list_version is
  'Phiên bản curated_list_releases đã nhận; nhỏ hơn bản mới nhất thì sổ hỏi "có thêm N từ".';

/* ---------- Thư viện ---------- */

-- Danh sách đã xuất bản theo bản phát hành mới nhất (ai cũng đọc, kể cả khách). Số người học chỉ
-- là số tổng hợp (notebooks của người khác không đọc được qua RLS). p_list_id: chỉ một danh sách.
create function public.library_lists(p_list_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.published_at desc), '[]'::jsonb)
  from (
    select
      l.id, l.title, l.description, l.language, l.target_cefr, l.topic, l.purpose,
      l.suggested_days, l.cover_url,
      r.version, r.word_count, r.published_at,
      (select count(distinct n.user_id)::integer from public.notebooks n
       where n.source_list_id = l.id and n.deleted_at is null) as learner_count,
      coalesce((
        select array_agg(s.subtopic order by s.first_order)
        from (
          select ri.subtopic, min(ri.item_order) as first_order
          from public.curated_list_release_items ri
          where ri.list_id = l.id and ri.version = r.version and ri.subtopic is not null
          group by ri.subtopic
        ) s
      ), '{}') as subtopics
    from public.curated_lists l
    join lateral (
      select rr.version, rr.word_count, rr.published_at
      from public.curated_list_releases rr
      where rr.list_id = l.id
      order by rr.version desc
      limit 1
    ) r on true
    where p_list_id is null or l.id = p_list_id
  ) x;
$$;

revoke all on function public.library_lists(uuid) from public;
grant execute on function public.library_lists(uuid) to anon, authenticated;
