-- Test Prompt 2.4a: giới hạn từ mới theo gói, tự thêm từ vào sổ khi tạo xong (ID giống máy
-- khách), tên sổ trùng, gợi ý theo tiền tố, người dùng không tự đổi gói.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('99999999-0000-4000-8000-000000000001', 'free@test.local'),
  ('99999999-0000-4000-8000-000000000002', 'premium@test.local');
update public.profiles set plan = 'premium' where user_id = '99999999-0000-4000-8000-000000000002';
update private.settings set value = 1 where key = 'user_daily_new_words';
update private.settings set value = 2 where key = 'premium_daily_new_words';

insert into public.notebooks (id, user_id, name) values
  ('99999999-0000-4000-8000-0000000000b1', '99999999-0000-4000-8000-000000000001', 'IELTS'),
  ('99999999-0000-4000-8000-0000000000b2', '99999999-0000-4000-8000-000000000002', 'Khác');

/* ---------- Giới hạn theo gói ---------- */

set local role service_role;

select is(
  (public.request_word_job('99999999-0000-4000-8000-000000000001', 'en', 'nb-alpha', null,
     '99999999-0000-4000-8000-0000000000b1', 'Câu gốc', 'typed') ->> 'limit_reached')::boolean,
  false, 'Free: từ mới đầu tiên được nhận');
select is(
  public.request_word_job('99999999-0000-4000-8000-000000000001', 'en', 'nb-beta') ->> 'limit_reached',
  'true', 'Free: quá giới hạn ngày');
select is(
  public.request_word_job('99999999-0000-4000-8000-000000000001', 'en', 'nb-beta') ->> 'plan',
  'free', 'Trả về gói để app mời nâng cấp');
select is(
  (public.request_word_job('99999999-0000-4000-8000-000000000002', 'en', 'nb-beta') ->> 'limit_reached')::boolean
  or (public.request_word_job('99999999-0000-4000-8000-000000000002', 'en', 'nb-gamma') ->> 'limit_reached')::boolean,
  false, 'Premium: giới hạn riêng lớn hơn');

select is(
  (select notebook_id from public.word_job_requests r join public.word_jobs j on j.id = r.job_id
   where j.lemma = 'nb-alpha'),
  '99999999-0000-4000-8000-0000000000b1'::uuid, 'Ghi lại sổ đích của yêu cầu');

-- Sổ của người khác thì bỏ qua đích đến.
select ok(public.request_word_job('99999999-0000-4000-8000-000000000002', 'en', 'nb-gamma', null,
  '99999999-0000-4000-8000-0000000000b1', null, 'typed') is not null,
  'Gọi lại cùng từ với sổ của người khác vẫn trả kết quả');
select is(
  (select notebook_id from public.word_job_requests r join public.word_jobs j on j.id = r.job_id
   where j.lemma = 'nb-gamma' and r.user_id = '99999999-0000-4000-8000-000000000002'),
  null, 'Không gắn được từ vào sổ của người khác');

/* ---------- Tạo xong → tự thêm vào sổ ---------- */

reset role;
insert into public.words (id, language, lemma, pos) values
  ('99999999-0000-4000-8000-0000000000a1', 'en', 'nb-alpha', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('99999999-0000-4000-8000-0000000000c2', '99999999-0000-4000-8000-0000000000a1', 1, 'second', 'thứ hai'),
  ('99999999-0000-4000-8000-0000000000c1', '99999999-0000-4000-8000-0000000000a1', 0, 'first', 'thứ nhất');

set local role service_role;
select public.complete_word_job(
  (select id from public.word_jobs where lemma = 'nb-alpha'), '99999999-0000-4000-8000-0000000000a1');

select is(
  (select sense_id from public.user_words where user_id = '99999999-0000-4000-8000-000000000001'),
  '99999999-0000-4000-8000-0000000000c1'::uuid, 'Thêm nghĩa phổ biến nhất (sense_order nhỏ nhất)');
select is(
  (select id from public.user_words where user_id = '99999999-0000-4000-8000-000000000001'),
  extensions.uuid_generate_v5('6f2a8c1e-9b4d-4e7a-a3f5-2d1c0b9e8f7a',
    'user_word:99999999-0000-4000-8000-000000000001:99999999-0000-4000-8000-0000000000c1'),
  'ID user_words giống máy khách (UUID v5)');
select is(
  (select status from public.user_words where user_id = '99999999-0000-4000-8000-000000000001'),
  'queued', 'Từ mới vào hàng Sắp học');
select is(
  (select context_sentence || '/' || input_method || '/' || notebook_id::text
   from public.notebook_entries where user_id = '99999999-0000-4000-8000-000000000001'),
  'Câu gốc/typed/99999999-0000-4000-8000-0000000000b1', 'Mục trong sổ giữ câu gốc và cách nhập');
select is(
  (select count(*) from public.cards where user_id = '99999999-0000-4000-8000-000000000001'
     and skill = 'meaning' and state = 0),
  1::bigint, 'Kèm thẻ ôn "meaning" mới');

/* ---------- Người dùng ---------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "99999999-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select throws_ok($$ update public.profiles set plan = 'premium' $$, '42501', null,
  'Người dùng không tự đổi gói');
select lives_ok($$
  insert into public.notebooks (user_id, name) values ('99999999-0000-4000-8000-000000000001', 'IELTS')
$$, 'Tên sổ trùng không làm kẹt đồng bộ (UI tự kiểm tra)');
select ok(
  (select jsonb_agg(x ->> 'lemma') from jsonb_array_elements(public.search_words('NB-AL')) x) ? 'nb-alpha',
  'search_words: không phân biệt hoa thường');
select is(jsonb_array_length(public.search_words('%')), 0, 'search_words: ký tự % không thành ký tự đại diện');

select * from finish();
rollback;
