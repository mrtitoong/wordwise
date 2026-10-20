-- Phần nền: hàm dùng chung, hồ sơ người dùng, vai trò.

-- Tự cập nhật updated_at khi sửa dòng.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type public.user_role as enum ('user', 'admin', 'teacher');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Hồ sơ và vai trò (user/admin/teacher). Tự tạo khi đăng ký.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Người dùng hiện tại có phải admin không. security definer để dùng trong policy
-- mà không bị chính RLS của profiles chặn.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

comment on function public.is_admin() is 'true nếu người gọi có vai trò admin. Dùng trong RLS policy.';
