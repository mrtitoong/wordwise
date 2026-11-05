-- Công tắc "Luyện viết chữ" (Z3): thẻ Chính tả của tiếng Trung là viết chữ Hán, tốn thời gian hơn gõ
-- nhiều nên người học tắt riêng được, không ảnh hưởng "Luyện chính tả" của tiếng Anh.

alter table public.user_settings
  add column practice_hanzi boolean not null default true;

comment on column public.user_settings.practice_hanzi is
  'Thẻ Viết chữ của tiếng Trung có vào phiên ôn không. Tắt chỉ lọc khỏi phiên, lịch giữ nguyên.';
