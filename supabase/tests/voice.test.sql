-- Test Prompt 2.5: giới hạn lượt nhận dạng giọng nói / tra ngược AI, tra ngược trong kho theo
-- nghĩa tiếng Việt.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('bbbb0000-0000-4000-8000-000000000001', 'voice@test.local'),
  ('bbbb0000-0000-4000-8000-000000000002', 'voice-other@test.local');
update private.settings set value = 2 where key = 'user_daily_transcribe';

insert into public.words (id, language, lemma, pos, frequency_rank) values
  ('bbbb0000-0000-4000-8000-0000000000a1', 'en', 'voice-run', 'verb', 10),
  ('bbbb0000-0000-4000-8000-0000000000a2', 'en', 'voice-burn', 'verb', 5);
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('bbbb0000-0000-4000-8000-0000000000c1', 'bbbb0000-0000-4000-8000-0000000000a1', 0, 'x', 'chạy bộ, chạy nhanh'),
  ('bbbb0000-0000-4000-8000-0000000000c2', 'bbbb0000-0000-4000-8000-0000000000a2', 0, 'x', 'cháy, đốt cháy');

set local role service_role;

select is((public.consume_usage('bbbb0000-0000-4000-8000-000000000001', 'transcribe') ->> 'allowed')::boolean,
  true, 'Lượt 1 được dùng');
select is((public.consume_usage('bbbb0000-0000-4000-8000-000000000001', 'transcribe') ->> 'remaining')::int,
  0, 'Lượt 2: còn 0');
select is((public.consume_usage('bbbb0000-0000-4000-8000-000000000001', 'transcribe') ->> 'allowed')::boolean,
  false, 'Quá giới hạn ngày');
select is((public.consume_usage('bbbb0000-0000-4000-8000-000000000002', 'transcribe') ->> 'allowed')::boolean,
  true, 'Giới hạn tính riêng từng người');
select throws_ok($$ select public.consume_usage('bbbb0000-0000-4000-8000-000000000001', 'khac') $$,
  null, null, 'Loại lượt lạ bị từ chối');

/* ---------- Tra ngược theo nghĩa ---------- */

reset role;
set local role anon;

select is(
  (select jsonb_agg(x ->> 'lemma' order by n)
   from jsonb_array_elements(public.search_by_meaning('chạy', 'en', 10)) with ordinality as t(x, n)
   where x ->> 'lemma' like 'voice-%'),
  '["voice-run", "voice-burn"]'::jsonb,
  'Khớp đúng dấu xếp trước ("chạy" trước "cháy")');
select is(
  (select jsonb_agg(x ->> 'lemma' order by n)
   from jsonb_array_elements(public.search_by_meaning('chay nhanh', 'en', 10)) with ordinality as t(x, n)
   where x ->> 'lemma' like 'voice-%'),
  '["voice-run"]'::jsonb,
  'Gõ không dấu vẫn tìm được, theo cụm từ trọn vẹn');
select is(jsonb_array_length(public.search_by_meaning('c')), 0, 'Quá ngắn → rỗng');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbb0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select throws_ok($$ select public.consume_usage('bbbb0000-0000-4000-8000-000000000001', 'transcribe') $$,
  '42501', null, 'Người dùng không tự trừ/cộng lượt');

select * from finish();
rollback;
