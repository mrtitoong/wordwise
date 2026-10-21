-- Màn Thẻ từ (Prompt 2.3): báo lỗi nội dung, ảnh gợi nhớ người dùng tự tải lên, giới hạn
-- kích thước nội dung "Của bạn".

/* ---------- Báo lỗi nội dung gốc ---------- */

insert into private.settings (key, value, note) values
  ('user_daily_reports', 20, 'Số báo lỗi nội dung mỗi người được gửi mỗi ngày')
on conflict (key) do nothing;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id uuid not null references public.words (id) on delete cascade,
  -- null khi lỗi nằm ở phần chung của từ (IPA, mẹo nhớ, nguồn gốc…).
  sense_id uuid references public.word_senses (id) on delete cascade,
  layer text not null check (layer in ('meaning', 'examples', 'usage', 'related', 'memory')),
  reason text not null check (reason in ('incorrect', 'translation', 'pronunciation', 'inappropriate', 'other')),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_reports is
  'Người dùng báo lỗi nội dung gốc trên thẻ từ (không sửa bản chung). Admin xem và xử lý (GĐ7).';

create index content_reports_status_idx on public.content_reports (status, created_at);
create index content_reports_user_day_idx on public.content_reports (user_id, created_at);
create index content_reports_word_idx on public.content_reports (word_id);

create trigger content_reports_set_updated_at
  before update on public.content_reports
  for each row execute function public.set_updated_at();

-- Kiểm tra trước khi thêm: nghĩa thuộc đúng từ, chưa quá số báo lỗi trong ngày (giờ Việt Nam).
create function private.check_content_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sense_id is not null and not exists (
    select 1 from public.word_senses s where s.id = new.sense_id and s.word_id = new.word_id
  ) then
    raise exception 'sense % không thuộc word %', new.sense_id, new.word_id
      using errcode = '23514';
  end if;

  if (
    select count(*) from public.content_reports r
    where r.user_id = new.user_id and r.created_at >= private.vn_day_start()
  ) >= private.setting('user_daily_reports') then
    raise exception 'report_limit_reached' using errcode = 'P0001',
      hint = 'Đã gửi đủ số báo lỗi hôm nay';
  end if;

  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.check_content_report() from public, anon, authenticated;

create trigger content_reports_a_check
  before insert on public.content_reports
  for each row execute function private.check_content_report();

alter table public.content_reports enable row level security;

create policy "content_reports: thêm của mình"
  on public.content_reports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "content_reports: đọc của mình hoặc admin"
  on public.content_reports for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy "content_reports: admin xử lý"
  on public.content_reports for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke all on public.content_reports from anon;
revoke delete, truncate on public.content_reports from authenticated;

/* ---------- Ảnh gợi nhớ tự tải lên ---------- */

-- Bucket riêng tư: mỗi người chỉ đọc/ghi thư mục {user_id}/ của mình; app hiện ảnh bằng
-- signed URL. Ảnh được thu nhỏ ở máy trước khi tải (WebP/JPEG, tối đa 512 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-images', 'user-images', false, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "user-images: chủ sở hữu đọc"
  on storage.objects for select to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "user-images: chủ sở hữu tải lên"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "user-images: chủ sở hữu xóa"
  on storage.objects for delete to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

/* ---------- Giới hạn nội dung riêng ---------- */

-- custom_image_url chỉ trỏ vào thư mục ảnh của chính người đó (không nhận URL ngoài).
alter table public.user_words
  add constraint user_words_custom_meaning_len check (char_length(custom_meaning) <= 200),
  add constraint user_words_custom_note_len check (char_length(custom_note) <= 1000),
  add constraint user_words_custom_image_own check (
    custom_image_url is null
    or custom_image_url like 'storage://user-images/' || user_id::text || '/%'
  ),
  add constraint user_words_additions_size check (octet_length(user_additions::text) <= 65536);

comment on column public.user_words.user_additions is
  'Nội dung "Của bạn" theo tab: { meaning, examples, usage, related, memory } (src/lib/words/user-additions.ts).';
comment on column public.user_words.custom_image_url is
  'Ảnh gợi nhớ tự tải lên: storage://user-images/{user_id}/{file}.';
