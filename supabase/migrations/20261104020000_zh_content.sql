-- Lưu được thẻ từ tiếng Trung (docs/plan-zh.md, Z1): nới loại từ, thêm bảng âm đọc từ CC-CEDICT.
-- Chỉ mở rộng; dữ liệu tiếng Anh không đổi. Bảng âm đọc chỉ có pinyin và giản/phồn thể, không có định
-- nghĩa, và giữ riêng để biết phần dữ liệu nào theo giấy phép CC BY-SA 4.0.

/* ---------- Loại từ: thêm lượng từ, trợ từ, số từ ---------- */

alter table public.words drop constraint words_pos_check;
alter table public.words add constraint words_pos_check check (pos in (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'determiner', 'interjection', 'phrasal_verb', 'phrase', 'classifier', 'particle', 'numeral'
));

alter table public.word_jobs drop constraint word_jobs_pos_check;
alter table public.word_jobs add constraint word_jobs_pos_check check (pos in (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'determiner', 'interjection', 'phrasal_verb', 'phrase', 'classifier', 'particle', 'numeral'
));

alter table public.curated_list_candidates drop constraint curated_list_candidates_pos_check;
alter table public.curated_list_candidates add constraint curated_list_candidates_pos_check check (pos in (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
  'determiner', 'interjection', 'phrasal_verb', 'phrase', 'classifier', 'particle', 'numeral'
));

/* ---------- Bảng âm đọc ---------- */

create table public.zh_lexicon (
  simplified text not null check (simplified <> ''),
  traditional text not null check (traditional <> ''),
  -- Pinyin số của CC-CEDICT, vd "ni3 hao3".
  pinyin text not null check (pinyin <> ''),
  -- false: chỉ là họ, biến thể, âm cổ hoặc âm chỉ dùng trong từ khác.
  common boolean not null,
  primary key (simplified, traditional, pinyin)
);

comment on table public.zh_lexicon is
  'Trích từ CC-CEDICT (MDBG), CC BY-SA 4.0. Nguồn: data/zh/lexicon.tsv. Chỉ service role ghi.';

alter table public.zh_lexicon enable row level security;

create policy "zh_lexicon: ai cũng đọc"
  on public.zh_lexicon for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.zh_lexicon from anon, authenticated;
