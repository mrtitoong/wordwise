-- Tập viết (Prompt 4.2): thẻ Chính tả vào phiên ôn khi người dùng bật "Luyện chính tả" (mặc định
-- bật). Tắt thì thẻ Chính tả vẫn giữ nguyên lịch, chỉ không xuất hiện trong phiên.

alter table public.user_settings
  add column practice_spelling boolean not null default true;

comment on column public.user_settings.practice_spelling is
  'Luyện chính tả: thẻ Chính tả (tập viết, nghe chép) có trong phiên ôn';
