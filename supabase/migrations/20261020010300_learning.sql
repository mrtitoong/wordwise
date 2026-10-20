-- Dữ liệu học của từng người. Mọi bảng có user_id để RLS và đồng bộ đơn giản.
-- Khóa ngoại kép (id, user_id) bảo đảm một người không thể gắn dữ liệu của mình
-- vào sổ tay/từ/thẻ của người khác, kể cả khi đoán được id.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  target_language text not null default 'en' check (target_language in ('en', 'ja', 'zh', 'ko', 'fr')),
  ui_locale text not null default 'vi' check (ui_locale in ('vi', 'en')),
  cefr_level text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  goals text[] not null default '{}',
  daily_new_limit smallint not null default 10 check (daily_new_limit between 1 and 100),
  daily_review_limit smallint not null default 200 check (daily_review_limit between 10 and 2000),
  desired_retention numeric(3, 2) not null default 0.90 check (desired_retention between 0.80 and 0.95),
  fsrs_params jsonb check (fsrs_params is null or jsonb_typeof(fsrs_params) = 'object'),
  reminder_time time,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  accent text not null default 'us' check (accent in ('us', 'uk')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  language text not null default 'en' check (language in ('en', 'ja', 'zh', 'ko', 'fr')),
  description text check (description is null or char_length(description) <= 500),
  cover_url text,
  tags text[] not null default '{}',
  source_list_id uuid references public.curated_lists (id) on delete set null,
  target_date date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- Từ trong kho cá nhân: một dòng cho mỗi nghĩa, dù nằm ở nhiều sổ tay.
create table public.user_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Không xóa được nghĩa có người đang học (Admin chỉ ẩn từ).
  sense_id uuid not null references public.word_senses (id) on delete restrict,
  custom_meaning text,
  custom_note text,
  custom_image_url text,
  -- Nội dung "Của bạn" theo tab: { examples: [...], collocations: [...], notes: [...] }
  user_additions jsonb not null default '{}' check (jsonb_typeof(user_additions) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'learning', 'suspended')),
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sense_id),
  unique (id, user_id)
);

create table public.notebook_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notebook_id uuid not null,
  user_word_id uuid not null,
  input_method text not null check (input_method in ('typed', 'voice', 'photo', 'csv', 'list')),
  context_sentence text,
  context_image_url text,
  source text,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notebook_id, user_word_id),
  foreign key (notebook_id, user_id) references public.notebooks (id, user_id) on delete cascade,
  foreign key (user_word_id, user_id) references public.user_words (id, user_id) on delete cascade
);

create index notebook_entries_notebook_idx on public.notebook_entries (notebook_id);
create index notebook_entries_user_word_idx on public.notebook_entries (user_word_id);
create index notebook_entries_user_idx on public.notebook_entries (user_id, updated_at);

-- Index cho khóa ngoại và cho đồng bộ (kéo thay đổi theo updated_at, Prompt 1.4).
create index user_words_sense_idx on public.user_words (sense_id);
create index user_words_user_updated_idx on public.user_words (user_id, updated_at);
create index notebooks_source_list_idx on public.notebooks (source_list_id);

-- Trạng thái FSRS cho từng kỹ năng của một từ (khớp Card của ts-fsrs).
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_word_id uuid not null,
  skill text not null check (skill in ('meaning', 'spelling', 'speaking')),
  due timestamptz not null default now(),
  stability double precision not null default 0 check (stability >= 0),
  difficulty double precision not null default 0 check (difficulty >= 0),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  learning_steps smallint not null default 0 check (learning_steps >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  -- 0 New, 1 Learning, 2 Review, 3 Relearning (enum State của ts-fsrs)
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_word_id, skill),
  unique (id, user_id),
  foreign key (user_word_id, user_id) references public.user_words (id, user_id) on delete cascade
);

create index cards_user_due_idx on public.cards (user_id, due);
create index cards_user_updated_idx on public.cards (user_id, updated_at);

-- Lịch sử ôn: CHỈ THÊM. id do máy khách tạo để đồng bộ lại không bị trùng.
create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null,
  mode text not null check (mode in ('flashcard', 'mcq', 'writing', 'listening', 'speaking')),
  -- 1 Again, 2 Hard, 3 Good, 4 Easy (Rating của ts-fsrs)
  rating smallint not null check (rating between 1 and 4),
  -- Trạng thái thẻ TRƯỚC lượt ôn, để tính tỉ lệ nhớ chỉ trên lượt ôn đến hạn.
  state smallint not null check (state between 0 and 3),
  hint_level smallint not null default 0 check (hint_level between 0 and 4),
  response_ms integer check (response_ms >= 0),
  correct boolean,
  pronunciation_score real check (pronunciation_score between 0 and 100),
  is_extra boolean not null default false,
  reviewed_at timestamptz not null,
  elapsed_days double precision not null default 0 check (elapsed_days >= 0),
  scheduled_days double precision not null default 0 check (scheduled_days >= 0),
  created_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index review_logs_user_reviewed_idx on public.review_logs (user_id, reviewed_at);
create index review_logs_card_idx on public.review_logs (card_id, reviewed_at);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();
create trigger notebooks_set_updated_at
  before update on public.notebooks
  for each row execute function public.set_updated_at();
create trigger user_words_set_updated_at
  before update on public.user_words
  for each row execute function public.set_updated_at();
create trigger notebook_entries_set_updated_at
  before update on public.notebook_entries
  for each row execute function public.set_updated_at();
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- Tạo hồ sơ và cài đặt mặc định khi có người đăng ký.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80), '')
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
