-- Cờ tiếng Trung theo tài khoản (docs/plan-zh.md): mặc định tắt, chỉ bật bằng SQL. Chỉ thêm cột;
-- người dùng không tự bật được vì quyền sửa profiles chỉ gồm display_name.

/* ---------- Cờ tính năng ---------- */

alter table public.profiles
  add column feature_zh boolean not null default false;

comment on column public.profiles.feature_zh is
  'Cho tài khoản dùng tiếng Trung. Bật bằng SQL: update profiles set feature_zh = true where …';
