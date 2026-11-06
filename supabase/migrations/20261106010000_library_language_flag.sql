-- Z5: Thư viện chỉ cho tài khoản có cờ feature_zh thấy danh sách tiếng Trung; khách và người học
-- tiếng Anh không thấy. Thân hàm giữ nguyên bản 20261025010000, chỉ thêm điều kiện theo ngôn ngữ.

/* ---------- Thư viện theo cờ ngôn ngữ ---------- */

create or replace function public.library_lists(p_list_id uuid default null)
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
    where (p_list_id is null or l.id = p_list_id)
      and (
        l.language = 'en'
        or exists (
          select 1 from public.profiles p
          where p.user_id = (select auth.uid()) and p.feature_zh
        )
      )
  ) x;
$$;
