-- Sửa theo Supabase advisors sau lần áp dụng đầu tiên.

-- 1. Bảo mật: hàm security definer không được gọi trực tiếp qua REST (/rpc).
--    Chuyển sang schema private (không công khai qua API). Policy tham chiếu hàm
--    theo OID nên tự trỏ sang vị trí mới.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

alter function public.is_admin() set schema private;
alter function public.handle_new_user() set schema private;

-- is_admin() vẫn cần gọi được trong policy của anon/authenticated.
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
-- handle_new_user() chỉ chạy qua trigger.
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- 2. Hiệu năng: index phủ khóa ngoại kép (id, user_id).
drop index if exists public.notebook_entries_notebook_idx;
drop index if exists public.notebook_entries_user_word_idx;
create index notebook_entries_notebook_user_idx on public.notebook_entries (notebook_id, user_id);
create index notebook_entries_user_word_user_idx on public.notebook_entries (user_word_id, user_id);
create index cards_user_word_user_idx on public.cards (user_word_id, user_id);

drop index if exists public.review_logs_card_idx;
create index review_logs_card_user_reviewed_idx on public.review_logs (card_id, user_id, reviewed_at);
