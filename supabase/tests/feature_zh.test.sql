-- Test cờ tiếng Trung: mặc định tắt, đọc được của mình, người dùng không tự bật.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'zh@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a1a1a1a1-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select is(
  (select feature_zh from public.profiles where user_id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  false, 'Tài khoản mới: cờ tắt');
select throws_ok($$ update public.profiles set feature_zh = true $$, '42501', null,
  'Người dùng không tự bật cờ');

reset role;
update public.profiles set feature_zh = true
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select feature_zh from public.profiles where user_id = 'a1a1a1a1-0000-4000-8000-000000000001'),
  true, 'Bật bằng SQL thì tài khoản đọc được');

select * from finish();
rollback;
