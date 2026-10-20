-- Test các quy tắc đồng bộ (Prompt 1.4): thẻ không bị lùi, mốc thời gian do server đặt.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('44444444-4444-4444-8444-444444444444', 'sync@test.local');
insert into public.words (id, language, lemma, pos) values
  ('dddddddd-0000-4000-8000-000000000001', 'en', 'sync-test-word', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 0, 'a test', 'từ thử');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-8444-444444444444", "role": "authenticated"}', true);

insert into public.user_words (id, user_id, sense_id)
values ('dddddddd-0000-4000-8000-00000000000a', '44444444-4444-4444-8444-444444444444', 'dddddddd-0000-4000-8000-000000000002');

-- Máy khách gửi updated_at sai (năm 2000): server ghi đè bằng giờ server.
insert into public.cards (id, user_id, user_word_id, skill, reps, last_review, updated_at)
values ('dddddddd-0000-4000-8000-00000000000b', '44444444-4444-4444-8444-444444444444',
        'dddddddd-0000-4000-8000-00000000000a', 'meaning', 3, '2026-10-20 10:00+00', '2000-01-01');
select ok(
  (select updated_at > '2020-01-01' from public.cards where id = 'dddddddd-0000-4000-8000-00000000000b'),
  'Thêm thẻ: updated_at do server đặt');

insert into public.review_logs (id, user_id, card_id, mode, rating, state, reviewed_at, created_at)
values ('dddddddd-0000-4000-8000-00000000000c', '44444444-4444-4444-8444-444444444444',
        'dddddddd-0000-4000-8000-00000000000b', 'flashcard', 3, 2, '2026-10-20 10:00+00', '2000-01-01');
select ok(
  (select created_at > '2020-01-01' from public.review_logs where id = 'dddddddd-0000-4000-8000-00000000000c'),
  'Thêm lượt ôn: created_at do server đặt');

-- Bản cũ hơn (last_review sớm hơn) không ghi đè tiến độ.
update public.cards set reps = 1, last_review = '2026-10-19 10:00+00', due = '2026-10-19 11:00+00'
where id = 'dddddddd-0000-4000-8000-00000000000b';
select is(
  (select reps from public.cards where id = 'dddddddd-0000-4000-8000-00000000000b'),
  3, 'Bản cũ hơn không làm lùi số lần ôn');
select is(
  (select last_review from public.cards where id = 'dddddddd-0000-4000-8000-00000000000b'),
  '2026-10-20 10:00+00'::timestamptz, 'Bản cũ hơn không làm lùi last_review');

-- Bản cũ hơn nhưng có cờ xóa: vẫn nhận cờ xóa.
update public.cards set reps = 1, last_review = '2026-10-19 10:00+00', deleted_at = '2026-10-21 00:00+00'
where id = 'dddddddd-0000-4000-8000-00000000000b';
select isnt(
  (select deleted_at from public.cards where id = 'dddddddd-0000-4000-8000-00000000000b'),
  null, 'Cờ xóa vẫn được ghi');

-- Bản mới hơn thì được ghi.
update public.cards set reps = 4, last_review = '2026-10-21 10:00+00'
where id = 'dddddddd-0000-4000-8000-00000000000b';
select is(
  (select reps from public.cards where id = 'dddddddd-0000-4000-8000-00000000000b'),
  4, 'Bản mới hơn được ghi');

-- Không gọi trực tiếp được hàm trigger qua API.
select throws_ok($$ select private.keep_latest_card_review() $$);

select * from finish();
rollback;
