-- Test bảng âm Hán Việt: ai cũng đọc, không ai ngoài máy chủ ghi, sai dạng dữ liệu bị chặn.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.zh_han_viet (char, readings, reviewed)
  values ('好', '[{"am": "hảo", "meaning_vi": "tốt"}]', true);

select throws_ok($$
  insert into public.zh_han_viet (char, readings) values ('学校', '[]')
$$, '23514', null, 'Chỉ nhận một chữ');
select throws_ok($$
  insert into public.zh_han_viet (char, readings) values ('学', '"học"')
$$, '23514', null, 'Âm đọc phải là mảng');

set local role anon;
select is(
  (select readings -> 0 ->> 'am' from public.zh_han_viet where char = '好'),
  'hảo', 'Khách đọc được âm Hán Việt');
reset role;

set local role authenticated;
select throws_ok($$
  insert into public.zh_han_viet (char, readings) values ('学', '[]')
$$, '42501', null, 'Người dùng không ghi được');
select throws_ok($$ delete from public.zh_han_viet $$, '42501', null, 'Người dùng không xóa được');
reset role;

select * from finish();
rollback;
