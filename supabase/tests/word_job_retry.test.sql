-- "Thử lại" từ tạo nội dung bị lỗi (danh sách Đang chuẩn bị, 2026-10-26).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-666666666661', 'retry-a@test.local'),
  ('66666666-6666-4666-8666-666666666662', 'retry-b@test.local');

insert into public.word_jobs (id, language, lemma, pos, status, attempts, first_started_at, finished_at, last_error)
values
  ('77777777-7777-4777-8777-777777777771', 'en', 'flibbert', 'noun', 'failed', 3, now(), now(), 'lỗi'),
  ('77777777-7777-4777-8777-777777777772', 'en', 'gronk', 'noun', 'failed', 3, now(), now(), 'lỗi'),
  ('77777777-7777-4777-8777-777777777773', 'en', 'gronk', 'noun', 'queued', 0, null, null, null);
insert into public.word_job_requests (job_id, user_id, created_at) values
  ('77777777-7777-4777-8777-777777777771', '66666666-6666-4666-8666-666666666661', now() - interval '1 hour'),
  ('77777777-7777-4777-8777-777777777772', '66666666-6666-4666-8666-666666666661', now() - interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "66666666-6666-4666-8666-666666666662", "role": "authenticated"}', true);
select is(public.retry_word_job('77777777-7777-4777-8777-777777777771'), 'not_found',
  'Người không yêu cầu việc này không thử lại được');

select set_config('request.jwt.claims',
  '{"sub": "66666666-6666-4666-8666-666666666661", "role": "authenticated"}', true);
select is(public.retry_word_job('77777777-7777-4777-8777-777777777771'), 'queued', 'Thử lại → xếp lại việc');
select is(public.retry_word_job('77777777-7777-4777-8777-777777777771'), 'queued',
  'Việc đang chờ: trả trạng thái, không làm gì thêm');

reset role;
select results_eq(
  $$select status, attempts::int, user_retries::int, first_started_at is not null
    from public.word_jobs where id = '77777777-7777-4777-8777-777777777771'$$,
  $$values ('queued'::text, 0, 1, true)$$,
  'Đặt lại số lần chạy, đếm lần thử lại, giữ lần chạy đầu (không tính lại vào trần hệ thống)');
select is(
  (select count(*)::int from public.word_job_requests where user_id = '66666666-6666-4666-8666-666666666661'),
  2, 'Không thêm yêu cầu mới (không trừ thêm lượt từ mới trong ngày)');

-- Cùng từ đã có việc khác đang chờ: chuyển yêu cầu sang việc đó, giữ created_at.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "66666666-6666-4666-8666-666666666661", "role": "authenticated"}', true);
select is(public.retry_word_job('77777777-7777-4777-8777-777777777772'), 'queued', 'Thử lại từ đã có việc khác');
reset role;
select results_eq(
  $$select job_id::text, created_at < now() from public.word_job_requests
    where user_id = '66666666-6666-4666-8666-666666666661' and job_id <> '77777777-7777-4777-8777-777777777771'$$,
  $$values ('77777777-7777-4777-8777-777777777773'::text, true)$$,
  'Yêu cầu chuyển sang việc đang chờ, giữ thời điểm yêu cầu');

-- Tối đa 3 lần.
update public.word_jobs set status = 'failed', user_retries = 3
where id = '77777777-7777-4777-8777-777777777771';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "66666666-6666-4666-8666-666666666661", "role": "authenticated"}', true);
select is(public.retry_word_job('77777777-7777-4777-8777-777777777771'), 'retry_limit', 'Quá 3 lần thử lại');

set local role anon;
select throws_ok($$select public.retry_word_job('77777777-7777-4777-8777-777777777771')$$, '42501',
  null, 'Khách không gọi được');

select * from finish();
rollback;
