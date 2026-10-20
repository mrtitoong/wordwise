-- Danh sách có chủ đích của Admin và hàng đợi xử lý nền.

create table public.curated_lists (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  language text not null check (language in ('en', 'ja', 'zh', 'ko', 'fr')),
  target_cefr text check (target_cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topic text,
  purpose text,
  suggested_days integer check (suggested_days between 1 and 730),
  cover_url text,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'review', 'published')),
  version integer not null default 1 check (version >= 1),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.curated_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.curated_lists (id) on delete cascade,
  -- Không xóa được nghĩa đang nằm trong danh sách.
  sense_id uuid not null references public.word_senses (id) on delete restrict,
  item_order integer not null check (item_order >= 0),
  subtopic text,
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  admin_note text,
  context_sentence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, sense_id)
);

create index curated_list_items_list_order_idx on public.curated_list_items (list_id, item_order);
create index curated_list_items_sense_idx on public.curated_list_items (sense_id);
create index curated_lists_created_by_idx on public.curated_lists (created_by);
create index curated_lists_status_idx on public.curated_lists (status, language);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('csv', 'photo', 'admin_list')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  list_id uuid references public.curated_lists (id) on delete cascade,
  total integer not null default 0 check (total >= 0),
  done integer not null default 0 check (done >= 0),
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_user_idx on public.import_jobs (user_id, created_at desc);
create index import_jobs_list_idx on public.import_jobs (list_id);

create trigger curated_lists_set_updated_at
  before update on public.curated_lists
  for each row execute function public.set_updated_at();
create trigger curated_list_items_set_updated_at
  before update on public.curated_list_items
  for each row execute function public.set_updated_at();
create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();
