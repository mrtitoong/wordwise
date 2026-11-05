-- Test công tắc "Luyện viết chữ": mặc định bật, chủ tài khoản tự đổi được.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email) values
  ('a3a3a3a3-0000-4000-8000-000000000001', 'zh-review@test.local');
insert into public.user_settings (user_id)
  values ('a3a3a3a3-0000-4000-8000-000000000001')
  on conflict (user_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a3a3a3a3-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select is(
  (select practice_hanzi from public.user_settings
    where user_id = 'a3a3a3a3-0000-4000-8000-000000000001'),
  true, 'Tài khoản mới: bật Luyện viết chữ');

update public.user_settings set practice_hanzi = false
  where user_id = 'a3a3a3a3-0000-4000-8000-000000000001';
select is(
  (select practice_hanzi from public.user_settings
    where user_id = 'a3a3a3a3-0000-4000-8000-000000000001'),
  false, 'Chủ tài khoản tắt được');

select * from finish();
rollback;
