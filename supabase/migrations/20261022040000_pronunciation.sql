-- Chấm phát âm (Prompt 5.2): mọi tài khoản đã đăng nhập, 100 lần/người/ngày (đổi bằng SQL ở
-- private.settings). Bản thu không được lưu; usage_events chỉ ghi một dòng đếm lượt.

insert into private.settings (key, value, note) values
  ('user_daily_pronunciation', 100, 'Số lần chấm phát âm mỗi người mỗi ngày')
on conflict (key) do nothing;

alter table public.usage_events drop constraint usage_events_kind_check;
alter table public.usage_events
  add constraint usage_events_kind_check
  check (kind in ('transcribe', 'reverse_ai', 'ocr', 'pronunciation'));
