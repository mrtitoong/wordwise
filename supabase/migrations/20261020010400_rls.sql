-- Row Level Security cho mọi bảng.
--   Nội dung từ    : ai cũng đọc, chỉ service role ghi (không có policy ghi).
--   Dữ liệu cá nhân: chỉ chủ sở hữu đọc/ghi.
--   review_logs    : chỉ đọc và thêm; không sửa, không xóa.
--   curated_lists  : admin ghi; người dùng chỉ đọc danh sách đã xuất bản.
-- Dùng (select auth.uid()) để Postgres tính một lần mỗi truy vấn.

alter table public.profiles enable row level security;
alter table public.words enable row level security;
alter table public.word_senses enable row level security;
alter table public.word_details enable row level security;
alter table public.curated_lists enable row level security;
alter table public.curated_list_items enable row level security;
alter table public.import_jobs enable row level security;
alter table public.user_settings enable row level security;
alter table public.notebooks enable row level security;
alter table public.user_words enable row level security;
alter table public.notebook_entries enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;

-- ---------- profiles ----------
create policy "profiles: đọc của mình, admin đọc tất cả"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: sửa của mình"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Người dùng chỉ được sửa tên hiển thị, không tự đổi vai trò.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- ---------- nội dung từ ----------
create policy "words: mọi người đọc"
  on public.words for select to anon, authenticated using (true);
create policy "word_senses: mọi người đọc"
  on public.word_senses for select to anon, authenticated using (true);
create policy "word_details: mọi người đọc"
  on public.word_details for select to anon, authenticated using (true);

revoke insert, update, delete on public.words, public.word_senses, public.word_details
  from anon, authenticated;

-- ---------- danh sách có chủ đích ----------
create policy "curated_lists: đọc bản đã xuất bản, admin đọc tất cả"
  on public.curated_lists for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));

create policy "curated_lists: admin thêm"
  on public.curated_lists for insert to authenticated
  with check ((select public.is_admin()));
create policy "curated_lists: admin sửa"
  on public.curated_lists for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "curated_lists: admin xóa"
  on public.curated_lists for delete to authenticated
  using ((select public.is_admin()));

create policy "curated_list_items: đọc mục của danh sách đã xuất bản, admin đọc tất cả"
  on public.curated_list_items for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.curated_lists l
      where l.id = list_id and l.status = 'published'
    )
  );

create policy "curated_list_items: admin thêm"
  on public.curated_list_items for insert to authenticated
  with check ((select public.is_admin()));
create policy "curated_list_items: admin sửa"
  on public.curated_list_items for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "curated_list_items: admin xóa"
  on public.curated_list_items for delete to authenticated
  using ((select public.is_admin()));

-- ---------- import_jobs: người dùng tạo và xem việc của mình; worker (service role) cập nhật ----------
create policy "import_jobs: đọc của mình, admin đọc tất cả"
  on public.import_jobs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "import_jobs: tạo của mình"
  on public.import_jobs for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (kind <> 'admin_list' or (select public.is_admin()))
  );

revoke update, delete on public.import_jobs from anon, authenticated;

-- ---------- dữ liệu cá nhân: chỉ chủ sở hữu ----------
create policy "user_settings: chủ sở hữu"
  on public.user_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notebooks: chủ sở hữu"
  on public.notebooks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_words: chủ sở hữu"
  on public.user_words for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notebook_entries: chủ sở hữu"
  on public.notebook_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "cards: chủ sở hữu"
  on public.cards for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- review_logs: chỉ đọc và thêm ----------
create policy "review_logs: đọc của mình"
  on public.review_logs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "review_logs: thêm của mình"
  on public.review_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke update, delete, truncate on public.review_logs from anon, authenticated;

-- Khách chưa đăng nhập không chạm vào dữ liệu cá nhân.
revoke all on public.user_settings, public.notebooks, public.user_words,
  public.notebook_entries, public.cards, public.review_logs, public.import_jobs,
  public.profiles
  from anon;
