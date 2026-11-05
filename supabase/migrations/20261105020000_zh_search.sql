-- Tìm từ tiếng Trung (docs/plan-zh.md, Z2): tìm theo pinyin và đổi phồn thể sang giản thể. Chỉ thêm
-- cột và chỉ mục vào bảng từ điển; từ điển chỉ có âm đọc nên kết quả ngoài kho chưa có nghĩa.

/* ---------- Chỉ mục trên bảng từ điển ---------- */

alter table public.zh_lexicon
  add column pinyin_key text generated always as (
    regexp_replace(lower(replace(pinyin, 'u:', 'v')), '[1-5 ]', '', 'g')
  ) stored;

create index zh_lexicon_pinyin_key_idx on public.zh_lexicon (pinyin_key text_pattern_ops);
create index zh_lexicon_traditional_idx on public.zh_lexicon (traditional);

/* ---------- Tìm theo pinyin ---------- */

-- Từ trong kho trước, rồi đúng cả âm, âm thông dụng, từ chỉ gồm chữ có trong bảng 900 chữ, từ ngắn.
-- Không có số liệu tần suất nên bảng 900 chữ là cách gần nhất để đẩy từ hiếm xuống dưới.
create function public.search_zh_pinyin(p_key text, p_limit integer default 40)
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
      and l.pinyin_key like q.key || '%'
    group by l.simplified, l.pinyin
  ),
  ranked as (
    select h.*,
      exists (
        select 1 from public.words w
        where w.language = 'zh' and w.lemma = h.simplified and not w.is_hidden
      ) as in_store,
      not exists (
        select 1 from regexp_split_to_table(h.simplified, '') as c (ch)
        where not exists (select 1 from public.zh_han_viet v where v.char = c.ch)
      ) as known
    from hits h
  ),
  top as (
    select r.*, row_number() over (
      order by r.in_store desc, (r.pinyin_key = q.key) desc, r.common desc, r.known desc,
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

grant execute on function public.search_zh_pinyin(text, integer) to anon, authenticated;
