-- Xếp gợi ý pinyin theo cấp của chữ: gõ "shi" phải ra 是 trước 世. Chưa có số liệu tần suất nên dùng
-- cấp HSK của chữ, chỉ để xếp thứ tự, không hiện cho người học. Tìm theo khoảng để dùng được chỉ mục.

/* ---------- Cấp của chữ ---------- */

alter table public.zh_han_viet
  add column level smallint check (level between 1 and 9);

/* ---------- Tìm theo pinyin ---------- */

create or replace function public.search_zh_pinyin(p_key text, p_limit integer default 40)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with q as (
    select regexp_replace(lower(coalesce(p_key, '')), '[^a-z]', '', 'g') as key
  ),
  hits as (
    select l.simplified, l.pinyin, bool_or(l.common) as common, min(l.pinyin_key) as pinyin_key
    from public.zh_lexicon l, q
    where char_length(q.key) between 1 and 40
      and l.pinyin_key operator(pg_catalog.~>=~) q.key
      and l.pinyin_key operator(pg_catalog.~<~) (q.key || '{')
    group by l.simplified, l.pinyin
  ),
  ranked as (
    select h.*,
      exists (
        select 1 from public.words w
        where w.language = 'zh' and w.lemma = h.simplified and not w.is_hidden
      ) as in_store,
      -- Cấp của chữ khó nhất trong từ; có chữ ngoài bảng thì xếp sau cùng.
      (
        select max(coalesce(v.level, 10))
        from regexp_split_to_table(h.simplified, '') as c (ch)
        left join public.zh_han_viet v on v.char = c.ch
      ) as level
    from hits h
  ),
  top as (
    select r.*, row_number() over (
      order by r.in_store desc, (r.pinyin_key = q.key) desc, r.common desc, r.level,
        char_length(r.simplified), r.simplified, r.pinyin
    ) as rn
    from ranked r, q
    order by rn
    limit least(greatest(p_limit, 1), 60)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'lemma', t.simplified,
    'pinyin', t.pinyin,
    'words', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id,
        'lemma', w.lemma,
        'pos', w.pos,
        'cefr', w.cefr,
        'senses', (
          select jsonb_agg(jsonb_build_object('id', s.id, 'meaning_vi', s.meaning_vi) order by s.sense_order)
          from public.word_senses s where s.word_id = w.id
        )
      )), '[]'::jsonb)
      from public.words w
      where w.language = 'zh' and w.lemma = t.simplified and not w.is_hidden
    )
  ) order by t.rn), '[]'::jsonb)
  from top t;
$$;
