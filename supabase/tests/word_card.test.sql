-- Test màn Thẻ từ (Prompt 2.3): báo lỗi nội dung, ảnh tự tải lên, giới hạn nội dung riêng.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('88888888-0000-4000-8000-000000000001', 'card-a@test.local'),
  ('88888888-0000-4000-8000-000000000002', 'card-b@test.local'),
  ('88888888-0000-4000-8000-000000000003', 'card-admin@test.local');
update public.profiles set role = 'admin' where user_id = '88888888-0000-4000-8000-000000000003';

insert into public.words (id, language, lemma, pos) values
  ('88888888-0000-4000-8000-0000000000a1', 'en', 'card-test', 'noun'),
  ('88888888-0000-4000-8000-0000000000a2', 'en', 'card-other', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('88888888-0000-4000-8000-0000000000b1', '88888888-0000-4000-8000-0000000000a1', 0, 'a test', 'thử'),
  ('88888888-0000-4000-8000-0000000000b2', '88888888-0000-4000-8000-0000000000a2', 0, 'other', 'khác');
update private.settings set value = 2 where key = 'user_daily_reports';

/* ---------- Báo lỗi ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "88888888-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok($$
  insert into public.content_reports (word_id, sense_id, layer, reason, note)
  values ('88888888-0000-4000-8000-0000000000a1', '88888888-0000-4000-8000-0000000000b1', 'examples', 'incorrect', 'Câu 2 sai')
$$, 'Người dùng gửi được báo lỗi (user_id tự lấy từ phiên)');
select is(
  (select user_id::text || '/' || status from public.content_reports),
  '88888888-0000-4000-8000-000000000001/open', 'Báo lỗi gắn với người gửi, trạng thái open');

select throws_ok($$
  insert into public.content_reports (word_id, sense_id, layer, reason)
  values ('88888888-0000-4000-8000-0000000000a1', '88888888-0000-4000-8000-0000000000b2', 'meaning', 'incorrect')
$$, '23514', null, 'Nghĩa phải thuộc đúng từ');
select throws_ok($$
  insert into public.content_reports (user_id, word_id, layer, reason)
  values ('88888888-0000-4000-8000-000000000002', '88888888-0000-4000-8000-0000000000a1', 'memory', 'other')
$$, '42501', null, 'Không gửi báo lỗi dưới tên người khác');
select lives_ok($$
  insert into public.content_reports (word_id, layer, reason, status)
  values ('88888888-0000-4000-8000-0000000000a1', 'memory', 'other', 'resolved')
$$, 'Báo lỗi cấp từ (không có nghĩa) được nhận');
select is((select count(*) from public.content_reports where status = 'resolved'), 0::bigint,
  'Không có báo lỗi nào bị tự đặt resolved');
select throws_ok($$
  insert into public.content_reports (word_id, layer, reason)
  values ('88888888-0000-4000-8000-0000000000a1', 'memory', 'other')
$$, 'P0001', 'report_limit_reached', 'Quá số báo lỗi trong ngày');
update public.content_reports set status = 'resolved';
select is((select count(*) from public.content_reports where status = 'resolved'), 0::bigint,
  'Người dùng thường không sửa được báo lỗi');

select set_config('request.jwt.claims', '{"sub": "88888888-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.content_reports), 0::bigint, 'Người khác không đọc được báo lỗi');

select set_config('request.jwt.claims', '{"sub": "88888888-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select ok((select count(*) from public.content_reports) >= 1, 'Admin đọc được mọi báo lỗi');
select lives_ok($$ update public.content_reports set status = 'resolved' $$, 'Admin đánh dấu đã xử lý');

reset role;
set local role anon;
select throws_ok($$ select * from public.content_reports $$, '42501', null, 'Khách không đọc bảng báo lỗi');

/* ---------- Nội dung riêng ---------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "88888888-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok($$
  insert into public.user_words (user_id, sense_id, custom_image_url, user_additions)
  values ('88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-0000000000b1',
    'storage://user-images/88888888-0000-4000-8000-000000000001/a.webp',
    '{"examples": [{"id": "x", "sentence": "A card-test.", "translation_vi": null}]}')
$$, 'Ảnh trong thư mục của mình và nội dung tự thêm được lưu');
select throws_ok($$
  insert into public.user_words (user_id, sense_id, custom_image_url)
  values ('88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-0000000000b2',
    'https://evil.example/track.png')
$$, '23514', null, 'custom_image_url không nhận URL ngoài');
select throws_ok($$
  insert into public.user_words (user_id, sense_id, custom_image_url)
  values ('88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-0000000000b2',
    'storage://user-images/88888888-0000-4000-8000-000000000002/a.webp')
$$, '23514', null, 'custom_image_url không trỏ vào thư mục người khác');
select throws_ok($$
  insert into public.user_words (user_id, sense_id, user_additions)
  values ('88888888-0000-4000-8000-000000000001', '88888888-0000-4000-8000-0000000000b2',
    jsonb_build_object('memory', jsonb_build_array(jsonb_build_object('id', 'x', 'text', repeat('a', 70000)))))
$$, '23514', null, 'user_additions quá 64 KB bị chặn');

select * from finish();
rollback;
