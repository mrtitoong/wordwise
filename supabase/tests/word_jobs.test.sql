-- Test hàng đợi tạo nội dung từ (Prompt 2.1): gộp yêu cầu trùng, giới hạn ngày, thứ tự
-- ưu tiên, trần toàn hệ thống, lưu kết quả, thử lại, quyền truy cập.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email) values
  ('55555555-5555-4555-8555-555555555551', 'jobs-a@test.local'),
  ('55555555-5555-4555-8555-555555555552', 'jobs-b@test.local');

-- Hàm chạy với quyền service role (Edge Function).
set local role service_role;

/* ---------- request_word_job ---------- */

create temp table r1 as
  select public.request_word_job('55555555-5555-4555-8555-555555555551', 'en', 'zygote', 'noun') as r;
select is((select r ->> 'status' from r1), 'queued', 'Từ mới → xếp việc');
select is((select (r ->> 'limit_reached')::boolean from r1), false, 'Chưa vượt giới hạn');

select is(
  public.request_word_job('55555555-5555-4555-8555-555555555551', 'en', 'zygote', 'noun') ->> 'job_id',
  (select r ->> 'job_id' from r1),
  'Gọi lại cùng từ → cùng việc');
select is(
  public.request_word_job('55555555-5555-4555-8555-555555555552', 'en', 'zygote', 'noun') ->> 'job_id',
  (select r ->> 'job_id' from r1),
  'Người khác thêm cùng từ → gộp vào việc đang chờ');
select is(
  (select count(*)::int from public.word_jobs where lemma = 'zygote'), 1, 'Chỉ một việc cho một từ');
select is(
  (select count(*)::int from public.word_job_requests where user_id = '55555555-5555-4555-8555-555555555551'),
  1, 'Gọi lại không tính thêm vào giới hạn');

-- Giới hạn ngày (đặt 2 để test).
reset role;
update private.settings set value = 2 where key = 'user_daily_new_words';
set local role service_role;
select is(
  public.request_word_job('55555555-5555-4555-8555-555555555551', 'en', 'quokka', 'noun') ->> 'limit_reached',
  'false', 'Từ mới thứ 2 trong ngày: được');
select is(
  public.request_word_job('55555555-5555-4555-8555-555555555551', 'en', 'axolotl', 'noun') ->> 'limit_reached',
  'true', 'Từ mới thứ 3 trong ngày: vượt giới hạn');
select is(
  (select count(*)::int from public.word_jobs where lemma = 'axolotl'), 0, 'Vượt giới hạn → không tạo việc');
select is(
  public.request_word_job('55555555-5555-4555-8555-555555555551', 'en', 'zygote', 'noun') ->> 'limit_reached',
  'false', 'Việc đã yêu cầu vẫn hỏi trạng thái được khi hết lượt');

/* ---------- claim_word_jobs ---------- */

select is(
  public.enqueue_bulk_words('en', '[{"lemma": "Apple", "frequency_rank": 900}, {"lemma": "apple"}, {"lemma": "  "}]'),
  1, 'Tạo trước: chuẩn hóa, bỏ trùng và dòng rỗng');
reset role;
-- Việc tạo trước xếp sớm hơn nhưng việc của người dùng vẫn được nhận trước.
-- Trong một transaction now() không đổi → đặt run_after để thứ tự xác định.
update public.word_jobs set run_after = now() - interval '1 hour' where lemma = 'apple';
update public.word_jobs set run_after = now() - interval '30 minutes' where lemma = 'zygote';
set local role service_role;

create temp table c1 as select public.claim_word_jobs(1) as c;
select is((select c -> 0 ->> 'source' from c1), 'user', 'Việc của người dùng được nhận trước việc tạo trước');
select is((select (c -> 0 ->> 'attempts')::int from c1), 1, 'Nhận việc → attempts = 1');
select is(
  (select status from public.word_jobs where id = (select (c -> 0 ->> 'id')::uuid from c1)),
  'running', 'Việc đã nhận chuyển sang running');

-- Trần toàn hệ thống = 0: việc mới không được nhận.
reset role;
update private.settings set value = 0 where key in ('global_daily_new_words', 'bulk_daily_new_words');
set local role service_role;
select is(jsonb_array_length(public.claim_word_jobs(10)), 0, 'Hết trần ngày → không nhận việc mới');

-- Việc đã bắt đầu (thử lại) không bị trần chặn.
select public.fail_word_job((select (c -> 0 ->> 'id')::uuid from c1), 'rate limited', now() - interval '1 second');
select is(
  public.claim_word_jobs(10) -> 0 ->> 'id', (select c -> 0 ->> 'id' from c1),
  'Việc thử lại vẫn được nhận khi hết trần');

-- Thử lại để sau: chưa đến giờ thì không nhận.
select public.fail_word_job((select (c -> 0 ->> 'id')::uuid from c1), 'rate limited', now() + interval '5 minutes');
select is(
  (select status from public.word_jobs where id = (select (c -> 0 ->> 'id')::uuid from c1)),
  'queued', 'Lỗi tạm thời → xếp lại');
select is(jsonb_array_length(public.claim_word_jobs(10)), 0, 'Chưa đến giờ thử lại → không nhận');

-- Worker chết giữa chừng: việc running quá 5 phút được nhận lại.
reset role;
update public.word_jobs set status = 'running', locked_at = now() - interval '6 minutes', run_after = now()
where id = (select (c -> 0 ->> 'id')::uuid from c1);
update private.settings set value = 1000 where key in ('global_daily_new_words', 'bulk_daily_new_words');
set local role service_role;
select is(
  public.claim_word_jobs(1, (select (c -> 0 ->> 'id')::uuid from c1)) -> 0 ->> 'attempts', '3',
  'Việc kẹt quá 5 phút được nhận lại (p_job_id chỉ nhận đúng việc đó)');

/* ---------- save_generated_word ---------- */

create temp table s1 as select public.save_generated_word(
  (select (c -> 0 ->> 'id')::uuid from c1),
  '{"id": "eeeeeeee-0000-4000-8000-000000000001", "language": "en", "lemma": "zygote", "pos": "noun",
    "ipa_us": "ˈzaɪ.ɡoʊt", "ipa_uk": null, "cefr": "C2", "register": "formal",
    "forms": {"inflections": [], "variants": []}, "details": {}, "schema_version": 1,
    "generated_by": "claude/claude-haiku-5-5 word-content@v1", "reviewed": false}',
  '[{"id": "eeeeeeee-0000-4000-8000-000000000002", "word_id": "eeeeeeee-0000-4000-8000-000000000001",
     "sense_order": 0, "definition_en": "a fertilized egg cell", "meaning_vi": "hợp tử", "image_query": "cell"}]',
  '[{"sense_id": "eeeeeeee-0000-4000-8000-000000000002", "examples": [], "synonyms": [], "antonyms": [],
     "collocations": [], "idioms": [], "common_mistakes": []}]') as id;
select is((select id from s1), 'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'Lưu từ mới');
select is(
  (select status || ':' || word_id from public.word_jobs where id = (select (c -> 0 ->> 'id')::uuid from c1)),
  'done:eeeeeeee-0000-4000-8000-000000000001', 'Lưu xong → việc done, trỏ tới từ');
select is((select count(*)::int from public.word_details where sense_id = 'eeeeeeee-0000-4000-8000-000000000002'),
  1, 'Lưu cả nghĩa và nội dung nghĩa');

-- Lưu trùng (worker khác đã lưu trước) → giữ bản cũ.
select is(public.save_generated_word(
  (select (c -> 0 ->> 'id')::uuid from c1),
  '{"id": "eeeeeeee-0000-4000-8000-0000000000ff", "language": "en", "lemma": "zygote", "pos": "noun",
    "cefr": "C2", "register": "formal", "forms": {"inflections": [], "variants": []}, "details": {},
    "schema_version": 1}', '[]', '[]'),
  'eeeeeeee-0000-4000-8000-000000000001'::uuid, 'Lưu trùng → trả id của bản đã có');

-- Thất bại hẳn rồi yêu cầu lại → tạo việc mới.
select public.fail_word_job((select id from public.word_jobs where lemma = 'quokka'), 'schema', null);
select is((select status from public.word_jobs where lemma = 'quokka'), 'failed', 'Hết lượt thử → failed');

select is(
  public.enqueue_bulk_words('en', '[{"lemma": "zygote"}]'), 0, 'Tạo trước bỏ qua từ đã có trong kho');

/* ---------- Quyền ---------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "55555555-5555-4555-8555-555555555552", "role": "authenticated"}', true);
select is(
  (select array_agg(lemma order by lemma) from public.word_jobs), array['zygote'],
  'Người dùng chỉ thấy việc mình đã yêu cầu');
select throws_ok(
  $$ select public.request_word_job('55555555-5555-4555-8555-555555555552', 'en', 'hack', null) $$,
  '42501', null, 'Người dùng không gọi trực tiếp được hàm xếp việc');
select throws_ok(
  $$ insert into public.word_jobs (language, lemma) values ('en', 'hack') $$,
  '42501', null, 'Người dùng không tự tạo việc');

reset role;
set local role service_role;
select is(public.verify_worker_secret('sai-khoa-0000000000000000000000000000'), false, 'Sai khóa worker → false');

select * from finish();
rollback;
