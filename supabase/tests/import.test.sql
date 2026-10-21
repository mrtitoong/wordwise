-- Test Prompt 2.4b: nhập file chỉ cho Premium, ghi chú riêng + tag của từ mới đi vào sổ khi tạo
-- xong, người dùng cập nhật được tiến độ import_jobs của chính mình.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('aaaa0000-0000-4000-8000-000000000001', 'import-free@test.local'),
  ('aaaa0000-0000-4000-8000-000000000002', 'import-premium@test.local');
update public.profiles set plan = 'premium' where user_id = 'aaaa0000-0000-4000-8000-000000000002';
insert into public.notebooks (id, user_id, name) values
  ('aaaa0000-0000-4000-8000-0000000000b2', 'aaaa0000-0000-4000-8000-000000000002', 'File');

set local role service_role;

select is(
  public.request_word_job('aaaa0000-0000-4000-8000-000000000001', 'en', 'imp-free', null, null,
    null, 'csv') ->> 'premium_required',
  'true', 'Free nhập file → premium_required');
select is(
  (select count(*) from public.word_job_requests where user_id = 'aaaa0000-0000-4000-8000-000000000001'),
  0::bigint, 'Free nhập file: không tạo việc, không tốn lượt');
select is(
  public.request_word_job('aaaa0000-0000-4000-8000-000000000001', 'en', 'imp-typed', null, null,
    null, 'typed') ->> 'premium_required',
  'false', 'Free gõ tay vẫn tạo được từ mới');

select is(
  public.request_word_job('aaaa0000-0000-4000-8000-000000000002', 'en', 'imp-premium', null,
    'aaaa0000-0000-4000-8000-0000000000b2', 'A sentence.', 'csv', 'hợp tử', array['bio', 'ielts'])
    ->> 'premium_required',
  'false', 'Premium nhập file được');

reset role;
insert into public.words (id, language, lemma, pos) values
  ('aaaa0000-0000-4000-8000-0000000000a1', 'en', 'imp-premium', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('aaaa0000-0000-4000-8000-0000000000c1', 'aaaa0000-0000-4000-8000-0000000000a1', 0, 'x', 'y');

set local role service_role;
select public.complete_word_job(
  (select id from public.word_jobs where lemma = 'imp-premium'), 'aaaa0000-0000-4000-8000-0000000000a1');
-- Gọi lại lần nữa (worker chạy trùng) không thêm ghi chú trùng.
select public.complete_word_job(
  (select id from public.word_jobs where lemma = 'imp-premium'), 'aaaa0000-0000-4000-8000-0000000000a1');

select is(
  (select tags from public.notebook_entries where user_id = 'aaaa0000-0000-4000-8000-000000000002'),
  array['bio', 'ielts'], 'Tag của file vào mục trong sổ');
select is(
  (select input_method from public.notebook_entries where user_id = 'aaaa0000-0000-4000-8000-000000000002'),
  'csv', 'Cách nhập là file');
select is(
  (select jsonb_array_length(user_additions -> 'meaning') || ':' || (user_additions -> 'meaning' -> 0 ->> 'text')
   from public.user_words where user_id = 'aaaa0000-0000-4000-8000-000000000002'),
  '1:hợp tử', 'Ghi chú riêng vào tab Nghĩa, không trùng');

/* ---------- Tiến độ import_jobs ---------- */

reset role;
insert into public.import_jobs (id, user_id, kind, total) values
  ('aaaa0000-0000-4000-8000-0000000000f1', 'aaaa0000-0000-4000-8000-000000000002', 'csv', 10),
  ('aaaa0000-0000-4000-8000-0000000000f2', 'aaaa0000-0000-4000-8000-000000000001', 'csv', 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaa0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

update public.import_jobs set done = 4, status = 'running';
select is(
  (select done from public.import_jobs where id = 'aaaa0000-0000-4000-8000-0000000000f1'),
  4, 'Cập nhật tiến độ việc nhập của mình');
select throws_ok($$ update public.import_jobs set user_id = 'aaaa0000-0000-4000-8000-000000000001' $$,
  '42501', null, 'Không đổi được chủ việc nhập');

reset role;
select is(
  (select done from public.import_jobs where id = 'aaaa0000-0000-4000-8000-0000000000f2'),
  0, 'Không cập nhật được việc nhập của người khác');

select * from finish();
rollback;
