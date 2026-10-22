-- Test Prompt 5.2: giới hạn lượt chấm phát âm (mọi tài khoản, 100/người/ngày).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('cccc0000-0000-4000-8000-000000000001', 'pron@test.local');

select is((select value from private.settings where key = 'user_daily_pronunciation'), 100,
  'Mặc định 100 lần chấm/người/ngày');

update private.settings set value = 1 where key = 'user_daily_pronunciation';
set local role service_role;

select is((public.consume_usage('cccc0000-0000-4000-8000-000000000001', 'pronunciation') ->> 'allowed')::boolean,
  true, 'Lượt chấm đầu được dùng');
select is((public.consume_usage('cccc0000-0000-4000-8000-000000000001', 'pronunciation') ->> 'allowed')::boolean,
  false, 'Quá giới hạn ngày');

select * from finish();
rollback;
