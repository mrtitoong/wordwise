-- Âm Hán Việt theo chữ (docs/plan-zh.md, Z1): bảng mới, không đổi cột cũ. Âm do máy gợi ý, có người
-- biết Hán Việt duyệt một phần (`reviewed`). Nguồn: data/zh/han-viet.json, chỉ service role ghi.

/* ---------- Bảng âm Hán Việt ---------- */

create table public.zh_han_viet (
  char text primary key check (char_length(char) = 1),
  -- [{ am, meaning_vi }], âm thông dụng nhất viết đầu; mảng rỗng: chữ không có âm thông dụng.
  readings jsonb not null check (jsonb_typeof(readings) = 'array'),
  reviewed boolean not null default false
);

comment on table public.zh_han_viet is
  'Âm Hán Việt của chữ giản thể. Nguồn: data/zh/han-viet.json. Chỉ service role ghi.';

alter table public.zh_han_viet enable row level security;

create policy "zh_han_viet: ai cũng đọc"
  on public.zh_han_viet for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.zh_han_viet from anon, authenticated;
