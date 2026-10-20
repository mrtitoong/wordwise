-- Đồng bộ offline-first (Prompt 1.4).

-- 1. Xóa mềm: máy khác cần biết dòng đã bị xóa, nếu xóa hẳn nó sẽ đẩy lại lên.
alter table public.notebooks add column deleted_at timestamptz;
alter table public.user_words add column deleted_at timestamptz;
alter table public.notebook_entries add column deleted_at timestamptz;
alter table public.cards add column deleted_at timestamptz;

-- 2. Mốc thời gian do server đặt: máy khách kéo thay đổi theo updated_at
--    (review_logs theo created_at), nên không tin giờ máy khách gửi lên.
create trigger user_settings_insert_updated_at
  before insert on public.user_settings
  for each row execute function public.set_updated_at();
create trigger notebooks_insert_updated_at
  before insert on public.notebooks
  for each row execute function public.set_updated_at();
create trigger user_words_insert_updated_at
  before insert on public.user_words
  for each row execute function public.set_updated_at();
create trigger notebook_entries_insert_updated_at
  before insert on public.notebook_entries
  for each row execute function public.set_updated_at();
create trigger cards_insert_updated_at
  before insert on public.cards
  for each row execute function public.set_updated_at();

create or replace function private.set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.set_created_at() from public, anon, authenticated;

create trigger review_logs_set_created_at
  before insert on public.review_logs
  for each row execute function private.set_created_at();

create index review_logs_user_created_idx on public.review_logs (user_id, created_at);

-- 3. Tiến độ thẻ không bị lùi: bản gửi lên có lần ôn cũ hơn bản trên server
--    (vd máy offline lâu) thì giữ trạng thái FSRS của server, chỉ nhận cờ xóa.
create or replace function private.keep_latest_card_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.last_review is not null
     and (new.last_review is null or new.last_review < old.last_review) then
    new.due := old.due;
    new.stability := old.stability;
    new.difficulty := old.difficulty;
    new.scheduled_days := old.scheduled_days;
    new.learning_steps := old.learning_steps;
    new.reps := old.reps;
    new.lapses := old.lapses;
    new.state := old.state;
    new.last_review := old.last_review;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_latest_card_review() from public, anon, authenticated;

-- Tên bắt đầu bằng "cards_a" để chạy trước cards_set_updated_at (trigger chạy
-- theo thứ tự tên); updated_at vẫn tăng để các máy kéo về bản đúng.
create trigger cards_a_keep_latest_review
  before update on public.cards
  for each row execute function private.keep_latest_card_review();
