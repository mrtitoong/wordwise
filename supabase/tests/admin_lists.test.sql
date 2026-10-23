-- Test Prompt 7.1: khu Admin – nguồn từ, bắt đầu/chạy lại phân tích, tổng quan danh sách.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('dddd0000-0000-4000-8000-000000000001', 'list-admin@test.local'),
  ('dddd0000-0000-4000-8000-000000000002', 'list-user@test.local');
update public.profiles set role = 'admin' where user_id = 'dddd0000-0000-4000-8000-000000000001';

insert into public.curated_lists (id, title, language) values
  ('dddd0000-0000-4000-8000-0000000000a1', 'Danh sách thử', 'en'),
  ('dddd0000-0000-4000-8000-0000000000a2', 'Danh sách trống', 'en');
-- Một người học đã thêm danh sách vào sổ.
insert into public.notebooks (id, user_id, name, source_list_id) values
  ('dddd0000-0000-4000-8000-0000000000b1', 'dddd0000-0000-4000-8000-000000000002', 'IELTS',
   'dddd0000-0000-4000-8000-0000000000a1');

/* ---------- Người dùng thường bị chặn ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "dddd0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select throws_ok($$ insert into public.curated_list_sources (list_id, kind, content)
  values ('dddd0000-0000-4000-8000-0000000000a1', 'lines', '[]') $$,
  '42501', null, 'Người dùng thường không thêm được nguồn từ');
select is((select count(*)::int from public.curated_list_sources), 0, 'Người dùng thường không đọc được nguồn từ');
select throws_ok($$ select public.start_list_analysis('dddd0000-0000-4000-8000-0000000000a1') $$,
  '42501', 'admin_required', 'Người dùng thường không bắt đầu phân tích được');
select throws_ok($$ select * from public.admin_list_overview() $$,
  '42501', 'admin_required', 'Người dùng thường không xem tổng quan được');
select throws_ok($$ insert into public.curated_lists (title, language) values ('x', 'en') $$,
  '42501', null, 'Người dùng thường không tạo danh sách được');

/* ---------- Admin ---------- */

select set_config('request.jwt.claims', '{"sub": "dddd0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select throws_ok($$ select public.start_list_analysis('dddd0000-0000-4000-8000-0000000000a2') $$,
  '22023', 'no_sources', 'Chưa có nguồn từ thì chưa phân tích được');

insert into public.curated_list_sources (list_id, kind, name, content, item_count, created_by) values
  ('dddd0000-0000-4000-8000-0000000000a1', 'lines', null,
   '[{"word": "climate", "note": null}, {"word": "pollution", "note": null}]', 2,
   'dddd0000-0000-4000-8000-000000000001'),
  ('dddd0000-0000-4000-8000-0000000000a1', 'document', 'bai-doc.pdf', '{"text": "The climate is changing."}', 0,
   'dddd0000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.curated_list_sources), 2, 'Admin thêm và đọc được nguồn từ');

select throws_ok($$ select public.start_list_analysis('dddd0000-0000-4000-8000-0000000000a1', '{"min_cefr": "Z9"}') $$,
  '22023', 'invalid_options', 'Cấp CEFR không hợp lệ bị chặn');
select isnt(public.start_list_analysis('dddd0000-0000-4000-8000-0000000000a1', '{"min_cefr": "B2"}'), null,
  'Admin bắt đầu phân tích');
select results_eq(
  $$ select l.status, j.kind, j.status, j.step, j.total, j.options ->> 'min_cefr'
     from public.curated_lists l join public.import_jobs j on j.list_id = l.id
     where l.id = 'dddd0000-0000-4000-8000-0000000000a1' $$,
  $$ values ('processing'::text, 'admin_list'::text, 'queued'::text, 'extract'::text, 2, 'B2'::text) $$,
  'Danh sách chuyển Đang xử lý, việc vào hàng đợi ở bước Trích xuất, tổng = số từ đã biết trước');
select throws_ok($$ select public.start_list_analysis('dddd0000-0000-4000-8000-0000000000a1') $$,
  '55000', 'list_busy', 'Đang phân tích thì không bắt đầu lần nữa');

select results_eq(
  $$ select item_count, source_count, learner_count, job_status, job_step
     from public.admin_list_overview() where id = 'dddd0000-0000-4000-8000-0000000000a1' $$,
  $$ values (0, 2, 1, 'queued'::text, 'extract'::text) $$,
  'Tổng quan: số nguồn, số người học, việc mới nhất');

select throws_ok(
  $$ select public.retry_list_analysis(
       (select id from public.import_jobs where list_id = 'dddd0000-0000-4000-8000-0000000000a1')) $$,
  '55000', 'job_not_retryable', 'Việc chưa lỗi thì không chạy lại');

-- Worker ghi lỗi ở bước Chọn nghĩa → Admin chạy lại từ bước đó.
reset role;
update public.import_jobs set status = 'failed', step = 'sense'
where list_id = 'dddd0000-0000-4000-8000-0000000000a1';
set local role authenticated;
select public.retry_list_analysis(
  (select id from public.import_jobs where list_id = 'dddd0000-0000-4000-8000-0000000000a1'));
select results_eq(
  $$ select status, step from public.import_jobs where list_id = 'dddd0000-0000-4000-8000-0000000000a1' $$,
  $$ values ('queued'::text, 'sense'::text) $$,
  'Chạy lại giữ nguyên bước lỗi');

select * from finish();
rollback;
