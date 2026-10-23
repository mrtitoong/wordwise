-- Tập phát âm (Prompt 5.3): "Luyện phát âm" – thẻ Phát âm vào phiên ôn hằng ngày (mặc định tắt vì
-- cần micro và chỗ yên tĩnh; ai cũng luyện được ở trang Luyện tập).

alter table public.user_settings
  add column practice_speaking boolean not null default false;

comment on column public.user_settings.practice_speaking is
  'Luyện phát âm: thẻ Phát âm có trong phiên ôn';
