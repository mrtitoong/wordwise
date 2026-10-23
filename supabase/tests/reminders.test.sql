-- Test Prompt 6.3: đăng ký nhận thông báo và chọn người cần nhắc học.
-- Giờ Việt Nam (UTC+7): nhắc lúc 20:00 = 13:00Z.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('cccc0000-0000-4000-8000-000000000001', 'remind@test.local'),
  ('cccc0000-0000-4000-8000-000000000002', 'remind-studied@test.local'),
  ('cccc0000-0000-4000-8000-000000000003', 'remind-nothing@test.local');
update public.user_settings
set reminder_time = '20:00', timezone = 'Asia/Ho_Chi_Minh', practice_spelling = false
where user_id in ('cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002',
                  'cccc0000-0000-4000-8000-000000000003');
update public.user_settings set ui_locale = 'en' where user_id = 'cccc0000-0000-4000-8000-000000000002';

insert into public.words (id, language, lemma, pos) values
  ('cccc0000-0000-4000-8000-0000000000a1', 'en', 'remind-test-a', 'noun'),
  ('cccc0000-0000-4000-8000-0000000000a2', 'en', 'remind-test-b', 'noun'),
  ('cccc0000-0000-4000-8000-0000000000a3', 'en', 'remind-test-c', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('cccc0000-0000-4000-8000-0000000000b1', 'cccc0000-0000-4000-8000-0000000000a1', 0, 'x', 'thử a'),
  ('cccc0000-0000-4000-8000-0000000000b2', 'cccc0000-0000-4000-8000-0000000000a2', 0, 'x', 'thử b'),
  ('cccc0000-0000-4000-8000-0000000000b3', 'cccc0000-0000-4000-8000-0000000000a3', 0, 'x', 'thử c');

-- Người 1: 2 thẻ Nghĩa đến hạn hôm nay, 1 thẻ Chính tả đến hạn (tắt Chính tả → không tính),
-- 1 từ mới chưa học, 1 thẻ đến hạn tuần sau.
insert into public.user_words (id, user_id, sense_id, status) values
  ('cccc0000-0000-4000-8000-0000000000c1', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000b1', 'learning'),
  ('cccc0000-0000-4000-8000-0000000000c2', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000b2', 'learning'),
  ('cccc0000-0000-4000-8000-0000000000c3', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000b3', 'learning'),
  ('cccc0000-0000-4000-8000-0000000000c4', 'cccc0000-0000-4000-8000-000000000002', 'cccc0000-0000-4000-8000-0000000000b1', 'learning');
insert into public.cards (id, user_id, user_word_id, skill, state, stability, due) values
  ('cccc0000-0000-4000-8000-0000000000d1', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000c1', 'meaning', 2, 5, '2026-10-22 01:00+00'),
  ('cccc0000-0000-4000-8000-0000000000d2', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000c2', 'meaning', 2, 5, '2026-10-22 18:00+00'),
  ('cccc0000-0000-4000-8000-0000000000d3', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000c1', 'spelling', 2, 5, '2026-10-22 01:00+00'),
  ('cccc0000-0000-4000-8000-0000000000d4', 'cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-0000000000c3', 'meaning', 0, 0, '2026-10-22 01:00+00'),
  ('cccc0000-0000-4000-8000-0000000000d5', 'cccc0000-0000-4000-8000-000000000002', 'cccc0000-0000-4000-8000-0000000000c4', 'meaning', 2, 5, '2026-10-22 01:00+00');
-- Người 2 đã ôn sáng nay (9:00 giờ VN).
insert into public.review_logs (card_id, user_id, mode, rating, state, reviewed_at) values
  ('cccc0000-0000-4000-8000-0000000000d5', 'cccc0000-0000-4000-8000-000000000002', 'mcq', 3, 2, '2026-10-22 02:00+00');

/* ---------- Đăng ký nhận thông báo ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccc0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('cccc0000-0000-4000-8000-000000000001', 'https://push.test/x', 'p', 'a') $$,
  '42501', null, 'Không ghi thẳng vào bảng (chỉ qua save_push_subscription)');
select lives_ok($$ select public.save_push_subscription('https://push.test/1', 'p', 'a', 'Chrome') $$,
  'Người dùng lưu đăng ký của trình duyệt mình');
select throws_ok($$ select public.save_push_subscription('http://push.test/plain', 'p', 'a') $$,
  '23514', null, 'Chỉ nhận địa chỉ https');

-- Người 3 dùng cùng trình duyệt (đổi tài khoản): đăng ký chuyển sang người 3.
select set_config('request.jwt.claims', '{"sub": "cccc0000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select public.save_push_subscription('https://push.test/1', 'p', 'a');
select is((select count(*)::int from public.push_subscriptions), 1,
  'Người 3 chỉ thấy đăng ký của mình');
select set_config('request.jwt.claims', '{"sub": "cccc0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is((select count(*)::int from public.push_subscriptions), 0,
  'Cùng trình duyệt: đăng ký đã chuyển khỏi người 1');
select public.save_push_subscription('https://push.test/1b', 'p', 'a');
select set_config('request.jwt.claims', '{"sub": "cccc0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select public.save_push_subscription('https://push.test/2', 'p', 'a');

select throws_ok($$ select * from public.claim_due_reminders('2026-10-22 13:05+00') $$,
  '42501', null, 'Người dùng không gọi được claim_due_reminders');

/* ---------- Chọn người cần nhắc ---------- */

reset role;
set local role service_role;

select is((select count(*)::int from public.claim_due_reminders('2026-10-22 12:55+00')), 0,
  'Chưa tới 20:00 giờ VN: chưa nhắc');
select is((select count(*)::int from public.claim_due_reminders('2026-10-22 16:30+00')), 0,
  'Trễ hơn 3 giờ (23:30): thôi không nhắc');
select results_eq(
  $$ select user_id, reviews, news, locale from public.claim_due_reminders('2026-10-22 13:05+00') $$,
  $$ values ('cccc0000-0000-4000-8000-000000000001'::uuid, 2, 1, 'vi'::text) $$,
  'Đến giờ: người 1 (2 thẻ đến hạn trong ngày học, 1 từ mới); người 2 đã học, người 3 không có gì');
select is((select count(*)::int from public.claim_due_reminders('2026-10-22 13:10+00')), 0,
  'Tối đa 1 lần/ngày');
reset role;
select is((select count(*)::int from private.reminders_sent), 1, 'Ghi ngày đã nhắc');
set local role service_role;
select is((select count(*)::int from public.claim_due_reminders('2026-10-23 13:05+00')
           where user_id = 'cccc0000-0000-4000-8000-000000000001'), 1,
  'Hôm sau nhắc lại (vẫn chưa học)');

-- Học lúc 1:00 sáng (vẫn là ngày học hôm trước) không tính cho ngày hôm sau.
insert into public.review_logs (card_id, user_id, mode, rating, state, reviewed_at) values
  ('cccc0000-0000-4000-8000-0000000000d1', 'cccc0000-0000-4000-8000-000000000001', 'mcq', 3, 2, '2026-10-23 18:00+00');
select is((select count(*)::int from public.claim_due_reminders('2026-10-24 13:05+00')
           where user_id = 'cccc0000-0000-4000-8000-000000000001'), 1,
  'Ôn lúc 1:00 sáng thuộc ngày học trước: hôm đó vẫn nhắc');

select * from finish();
rollback;
