-- Nội dung từ dùng chung (khớp src/lib/schema/word.ts, chuyển đổi bằng src/lib/schema/word-rows.ts).
--   words        : một dòng cho mỗi (language, lemma, pos) + dữ liệu cấp từ
--   word_senses  : các nghĩa của từ
--   word_details : nội dung theo nghĩa (ví dụ, quan hệ từ, cách dùng)

create table public.words (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en', 'ja', 'zh', 'ko', 'fr')),
  lemma text not null check (lemma <> '' and lemma = btrim(lemma)),
  pos text not null check (pos in (
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'determiner', 'interjection', 'phrasal_verb', 'phrase'
  )),
  ipa_us text,
  ipa_uk text,
  audio_us_url text,
  audio_uk_url text,
  cefr text check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  frequency_rank integer check (frequency_rank > 0),
  register text check (register in ('formal', 'neutral', 'informal', 'slang', 'offensive')),
  -- { inflections: [...], variants: [...] }
  forms jsonb not null default '{"inflections": [], "variants": []}'
    check (jsonb_typeof(forms) = 'object'),
  -- Dữ liệu chung cho cả từ: etymology_vi, homonyms, word_family, mnemonics,
  -- confusables, confidence, language_extra.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  schema_version smallint not null default 1,
  generated_by text,
  reviewed boolean not null default false,
  -- Admin ẩn từ khỏi tìm kiếm/thêm mới; người đang học vẫn thấy.
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (language, lemma, pos)
);

comment on table public.words is 'Nội dung từ dùng chung. Chỉ service role ghi.';

create table public.word_senses (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references public.words (id) on delete cascade,
  sense_order smallint not null check (sense_order >= 0),
  definition_en text not null check (definition_en <> ''),
  meaning_vi text not null check (meaning_vi <> ''),
  image_query text,
  image_url text,
  -- Ghi nguồn ảnh (Unsplash): { author, author_url, source_url }
  image_credit jsonb check (image_credit is null or jsonb_typeof(image_credit) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (word_id, sense_order)
);

create table public.word_details (
  sense_id uuid primary key references public.word_senses (id) on delete cascade,
  examples jsonb not null default '[]' check (jsonb_typeof(examples) = 'array'),
  synonyms jsonb not null default '[]' check (jsonb_typeof(synonyms) = 'array'),
  antonyms jsonb not null default '[]' check (jsonb_typeof(antonyms) = 'array'),
  collocations jsonb not null default '[]' check (jsonb_typeof(collocations) = 'array'),
  idioms jsonb not null default '[]' check (jsonb_typeof(idioms) = 'array'),
  common_mistakes jsonb not null default '[]' check (jsonb_typeof(common_mistakes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger words_set_updated_at
  before update on public.words
  for each row execute function public.set_updated_at();
create trigger word_senses_set_updated_at
  before update on public.word_senses
  for each row execute function public.set_updated_at();
create trigger word_details_set_updated_at
  before update on public.word_details
  for each row execute function public.set_updated_at();

-- Gợi ý tự động khi gõ: tìm theo tiền tố lemma.
create index words_lemma_prefix_idx on public.words (language, lemma text_pattern_ops);
