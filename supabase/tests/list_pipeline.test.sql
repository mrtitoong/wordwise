-- Test Prompt 7.2: pipeline phân tích danh sách – nhận việc/khóa, ghi kết quả từng bước, xếp việc tạo
-- nội dung nguồn 'admin' (trần riêng, ưu tiên), lỗi/thử lại, ghi mục danh sách, quyền truy cập.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

insert into auth.users (id, email) values
  ('eeee0000-0000-4000-8000-000000000001', 'pipe-admin@test.local'),
  ('eeee0000-0000-4000-8000-000000000002', 'pipe-user@test.local');
update public.profiles set role = 'admin' where user_id = 'eeee0000-0000-4000-8000-000000000001';

insert into public.curated_lists (id, title, language, target_cefr, topic) values
  ('eeee0000-0000-4000-8000-0000000000a1', 'IELTS thử', 'en', 'B2', 'Môi trường');
insert into public.curated_list_sources (list_id, kind, content, item_count) values
  ('eeee0000-0000-4000-8000-0000000000a1', 'lines', '[{"word": "climate", "note": null}]', 1);

-- Kho có sẵn "climate" (2 nghĩa).
insert into public.words (id, language, lemma, pos, cefr) values
  ('eeee0000-0000-4000-8000-0000000000c1', 'en', 'climate', 'noun', 'B1');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('eeee0000-0000-4000-8000-0000000000d1', 'eeee0000-0000-4000-8000-0000000000c1', 0, 'weather', 'khí hậu'),
  ('eeee0000-0000-4000-8000-0000000000d2', 'eeee0000-0000-4000-8000-0000000000c1', 1, 'mood', 'bầu không khí');

/* ---------- Admin bắt đầu ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
-- Giữ id việc trong biến phiên (role authenticated không tạo bảng tạm).
select set_config('test.job', public.start_list_analysis('eeee0000-0000-4000-8000-0000000000a1')::text, true);

select throws_ok($$ select public.claim_list_job() $$, '42501', null,
  'Người dùng (kể cả admin) không gọi được hàm của worker');

/* ---------- Worker nhận việc ---------- */

set local role service_role;
create temp table claimed as select public.claim_list_job() as j;
select is((select j ->> 'id' from claimed)::uuid, current_setting('test.job')::uuid, 'Worker nhận việc vừa xếp');
select is((select j -> 'list' ->> 'target_cefr' from claimed), 'B2', 'Kèm thông tin danh sách');
select is(public.claim_list_job(), null, 'Việc đang có worker giữ thì không nhận lần nữa');
select is((select status from public.import_jobs where id = current_setting('test.job')::uuid), 'running',
  'Nhận việc → running, có started_at');

-- Ghi tiến độ, giữ khóa.
select public.save_list_job(current_setting('test.job')::uuid, 'extract', 1, 1, '{"extract": {"source": 1}}',
  100, 50, 0.0002, 0, true);
select is(public.claim_list_job(), null, 'Giữ khóa → worker khác không nhận');
-- Chuyển bước, trả việc, cộng chi phí.
select public.save_list_job(current_setting('test.job')::uuid, 'normalize', 0, 1, '{"extract": {"source": 1}}',
  10, 5, 0.0001, 0, false);
select results_eq(
  $$ select step, input_tokens, output_tokens, cost_usd, state -> 'extract' ->> 'source', locked_at is null
     from public.import_jobs where id = current_setting('test.job')::uuid $$,
  $$ values ('normalize'::text, 110::bigint, 55::bigint, 0.0003::numeric(10,4), '1'::text, true) $$,
  'Ghi bước, trạng thái, cộng dồn token/chi phí, trả khóa');
select isnt(public.claim_list_job(), null, 'Đã trả khóa → nhận lại được');
-- Chờ tạo nội dung: chưa tới giờ thì không nhận.
select public.save_list_job(current_setting('test.job')::uuid, 'content', 0, 1, '{}', 0, 0, 0, 30, false);
select is(public.claim_list_job(), null, 'Đang chờ (run_after) → chưa nhận');
reset role;
update public.import_jobs set run_after = now() - interval '1 second' where id = current_setting('test.job')::uuid;
set local role service_role;
select isnt(public.claim_list_job(), null, 'Tới giờ → nhận lại');

/* ---------- Kết quả từng dòng ---------- */

select is(public.save_list_candidates(current_setting('test.job')::uuid,
  '[{"id": "eeee0000-0000-4000-8000-0000000000e1", "stage": "raw", "position": 0, "surface": "Climates"},
    {"id": "eeee0000-0000-4000-8000-0000000000e2", "stage": "raw", "position": 1, "surface": "zyx"}]'),
  2, 'Ghi dòng thô');
select is(public.save_list_candidates(current_setting('test.job')::uuid,
  '[{"id": "eeee0000-0000-4000-8000-0000000000e3", "stage": "merged", "position": 0, "surface": "climates",
     "lemma": "climate", "pos": "noun", "occurrences": 2, "tags": ["env"],
     "warnings": [{"code": "rare"}]}]', true),
  1, 'Bước chuẩn hóa thay dòng thô bằng dòng đã gộp');
select results_eq(
  $$ select stage, lemma, occurrences, tags, warnings -> 0 ->> 'code'
     from public.curated_list_candidates where job_id = current_setting('test.job')::uuid $$,
  $$ values ('merged'::text, 'climate'::text, 2, array['env']::text[], 'rare'::text) $$,
  'Chỉ còn dòng đã gộp, đủ cột');
select public.save_list_candidates(current_setting('test.job')::uuid,
  '[{"id": "eeee0000-0000-4000-8000-0000000000e3", "stage": "triaged", "position": 0, "surface": "climates",
     "lemma": "climate", "pos": "noun", "word_id": "eeee0000-0000-4000-8000-0000000000c1",
     "sense_id": "eeee0000-0000-4000-8000-0000000000d2", "sense_method": "context",
     "sense_confidence": 0.9, "item_order": 1}]');
select results_eq(
  $$ select stage, sense_id, sense_method, item_order from public.curated_list_candidates
     where id = 'eeee0000-0000-4000-8000-0000000000e3' $$,
  $$ values ('triaged'::text, 'eeee0000-0000-4000-8000-0000000000d2'::uuid, 'context'::text, 1) $$,
  'Ghi lại cùng id → cập nhật');
select throws_ok($$ select public.save_list_candidates(gen_random_uuid(), '[]') $$, 'P0002',
  'job_not_found', 'Việc không tồn tại bị chặn');

/* ---------- Xếp việc tạo nội dung (nguồn admin) ---------- */

create temp table enq as select public.enqueue_admin_words('en',
  '[{"key": "a", "lemma": "climate", "pos": null}, {"key": "b", "lemma": "Zeugma", "pos": "verb"}]') as r;
select is((select r -> 0 ->> 'word_id' from enq), 'eeee0000-0000-4000-8000-0000000000c1',
  'Từ đã có trong kho → trả word_id, không xếp việc');
select results_eq(
  $$ select source, lemma, pos, status from public.word_jobs where lemma = 'zeugma' $$,
  $$ values ('admin'::text, 'zeugma'::text, 'verb'::text, 'queued'::text) $$,
  'Từ mới → việc nguồn admin (chuẩn hóa chữ thường)');
select is((select (r -> 1 ->> 'created')::boolean from enq), true, 'Đánh dấu việc do danh sách tạo');
select is(
  public.enqueue_admin_words('en', '[{"key": "c", "lemma": "zeugma", "pos": "verb"}]') -> 0 ->> 'job_id',
  (select r -> 1 ->> 'job_id' from enq), 'Đang có việc → dùng chung');
select is(
  (public.enqueue_admin_words('en', '[{"key": "c", "lemma": "zeugma", "pos": "verb"}]') -> 0 ->> 'created')::boolean,
  false, 'Dùng chung việc → không tính là việc của danh sách');

-- Thứ tự nhận: người dùng → admin → tạo trước; trần riêng của admin.
select public.request_word_job('eeee0000-0000-4000-8000-000000000002', 'en', 'quokka', 'noun');
select public.enqueue_bulk_words('en', '[{"lemma": "axolotl"}]');
select is(
  (select jsonb_agg(x ->> 'source' order by ord) from jsonb_array_elements(public.claim_word_jobs(3))
     with ordinality as t(x, ord)),
  '["user", "admin", "bulk"]'::jsonb, 'Ưu tiên: người dùng, danh sách Admin, tạo trước');
reset role;
update public.word_jobs set status = 'queued', locked_at = null, first_started_at = null, attempts = 0;
update private.settings set value = 0 where key = 'admin_daily_new_words';
set local role service_role;
select is(
  (select count(*)::int from jsonb_array_elements(public.claim_word_jobs(5)) x where x ->> 'source' = 'admin'),
  0, 'Hết trần ngày của Admin → không nhận việc admin');
reset role;
update private.settings set value = 2000 where key = 'admin_daily_new_words';
set local role service_role;

select public.add_word_job_usage((select (r -> 1 ->> 'job_id')::uuid from enq), 1000, 4000, 0.0021);
select public.add_word_job_usage((select (r -> 1 ->> 'job_id')::uuid from enq), 10, 20, 0.0001);
select results_eq(
  $$ select input_tokens, output_tokens, cost_usd from public.word_jobs where lemma = 'zeugma' $$,
  $$ values (1010, 4020, 0.0022::numeric(10,6)) $$,
  'Cộng dồn chi phí của việc tạo nội dung');

/* ---------- Đọc kết quả: chỉ admin ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.curated_list_candidates), 0, 'Người dùng thường không đọc được kết quả');
select throws_ok($$ delete from public.curated_list_candidates $$, '42501', null,
  'Người dùng không xóa được kết quả');
select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is((select count(*)::int from public.curated_list_candidates), 1, 'Admin đọc được kết quả');
select throws_ok($$ update public.curated_list_candidates set lemma = 'x' $$, '42501', null,
  'Admin cũng không sửa trực tiếp (chỉ worker ghi)');

/* ---------- Xong: ghi mục danh sách ---------- */

set local role service_role;
-- Hai dòng cùng một nghĩa → giữ dòng đứng trước; dòng bị loại không vào danh sách.
select public.save_list_candidates(current_setting('test.job')::uuid,
  '[{"id": "eeee0000-0000-4000-8000-0000000000e4", "stage": "triaged", "position": 5, "surface": "climate",
     "lemma": "climate", "sense_id": "eeee0000-0000-4000-8000-0000000000d2", "item_order": 0,
     "subtopic": "Thời tiết", "context_sentence": "The climate changed.", "note": "ghi chú"},
    {"id": "eeee0000-0000-4000-8000-0000000000e5", "stage": "triaged", "position": 6, "surface": "weather",
     "lemma": "weather", "sense_id": "eeee0000-0000-4000-8000-0000000000d1", "item_order": 2,
     "warnings": [{"code": "no_context"}]},
    {"id": "eeee0000-0000-4000-8000-0000000000e6", "stage": "triaged", "position": 7, "surface": "cat",
     "lemma": "cat", "sense_id": "eeee0000-0000-4000-8000-0000000000d1", "item_order": 3,
     "dropped": "below_level"}]');
select is(public.finish_list_analysis(current_setting('test.job')::uuid, '{"items": 2}'), 2, 'Ghi 2 mục');
select results_eq(
  $$ select sense_id, item_order, subtopic, context_sentence, admin_note, warnings
     from public.curated_list_items where list_id = 'eeee0000-0000-4000-8000-0000000000a1'
     order by item_order $$,
  $$ values
     ('eeee0000-0000-4000-8000-0000000000d2'::uuid, 0, 'Thời tiết'::text, 'The climate changed.'::text,
      'ghi chú'::text, '[]'::jsonb),
     ('eeee0000-0000-4000-8000-0000000000d1'::uuid, 1, null, null, null, '[{"code": "no_context"}]'::jsonb) $$,
  'Mục theo thứ tự, mỗi nghĩa một lần, kèm chủ đề con, câu, ghi chú, cảnh báo');
select results_eq(
  $$ select j.status, j.step, j.state -> 'summary' ->> 'items', l.status
     from public.import_jobs j join public.curated_lists l on l.id = j.list_id
     where j.id = current_setting('test.job')::uuid $$,
  $$ values ('succeeded'::text, 'done'::text, '2'::text, 'review'::text) $$,
  'Việc xong, danh sách Chờ duyệt, có tóm tắt');

/* ---------- Lỗi: thử lại 3 lần rồi thất bại ---------- */

reset role;
update public.import_jobs set status = 'running', step = 'sense', attempts = 0 where id = current_setting('test.job')::uuid;
update public.curated_lists set status = 'processing' where id = 'eeee0000-0000-4000-8000-0000000000a1';
set local role service_role;
select is(public.fail_list_job(current_setting('test.job')::uuid, 'LLM quá tải'), 'retry', 'Lỗi lần 1 → thử lại sau');
select public.fail_list_job(current_setting('test.job')::uuid, 'LLM quá tải');
select is(public.fail_list_job(current_setting('test.job')::uuid, 'LLM quá tải'), 'failed', 'Lỗi lần 3 → thất bại');
select results_eq(
  $$ select j.status, j.step, jsonb_array_length(j.errors), j.errors -> 0 ->> 'step', l.status
     from public.import_jobs j join public.curated_lists l on l.id = j.list_id
     where j.id = current_setting('test.job')::uuid $$,
  $$ values ('failed'::text, 'sense'::text, 3, 'sense'::text, 'draft'::text) $$,
  'Thất bại: giữ bước lỗi, ghi lỗi, danh sách về Nháp');

set local role authenticated;
select public.retry_list_analysis(current_setting('test.job')::uuid);
select results_eq(
  $$ select status, step, attempts from public.import_jobs where id = current_setting('test.job')::uuid $$,
  $$ values ('queued'::text, 'sense'::text, 0::smallint) $$,
  'Admin chạy lại: về hàng đợi, đặt lại số lần lỗi');

select * from finish();
rollback;
