-- Tập nghe (Prompt 4.3): "Luyện nhiều giọng" – câu nghe đổi ngẫu nhiên giọng Mỹ/Anh (mặc định tắt,
-- nghe theo giọng đã chọn trong `accent`).

alter table public.user_settings
  add column multi_accent boolean not null default false;

comment on column public.user_settings.multi_accent is
  'Luyện nhiều giọng: tập nghe đổi ngẫu nhiên giọng Mỹ/Anh';
