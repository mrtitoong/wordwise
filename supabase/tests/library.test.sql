-- Test Prompt 7.4a: Thư viện (library_lists) và sổ theo danh sách (source_list_version).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('ffff0000-0000-4000-8000-000000000001', 'library-a@test.local'),
  ('ffff0000-0000-4000-8000-000000000002', 'library-b@test.local');

insert into public.words (id, language, lemma, pos, ipa_us, cefr, register) values
  ('ffff0000-0000-4000-8000-0000000000f1', 'en', 'zzlibone', 'noun', 'a', 'B1', 'neutral'),
  ('ffff0000-0000-4000-8000-0000000000f2', 'en', 'zzlibtwo', 'verb', 'b', 'B2', 'neutral');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('ffff0000-0000-4000-8000-0000000000e1', 'ffff0000-0000-4000-8000-0000000000f1', 0, 'one', 'một'),
  ('ffff0000-0000-4000-8000-0000000000e2', 'ffff0000-0000-4000-8000-0000000000f2', 0, 'two', 'hai');

-- a1: đã xuất bản 2 bản (bản 2 thêm e2); a2: nháp, chưa từng xuất bản.
insert into public.curated_lists (id, title, language, status, target_cefr, purpose, suggested_days,
  version, published_at) values
  ('ffff0000-0000-4000-8000-0000000000a1', 'Thư viện test', 'en', 'published', 'B2', 'ielts', 60, 2,
   now()),
  ('ffff0000-0000-4000-8000-0000000000a2', 'Nháp test', 'en', 'draft', null, null, null, 1, null);
insert into public.curated_list_releases (list_id, version, word_count, added_sense_ids) values
  ('ffff0000-0000-4000-8000-0000000000a1', 1, 1, array['ffff0000-0000-4000-8000-0000000000e1']::uuid[]),
  ('ffff0000-0000-4000-8000-0000000000a1', 2, 2, array['ffff0000-0000-4000-8000-0000000000e2']::uuid[]);
insert into public.curated_list_release_items (list_id, version, sense_id, item_order, subtopic) values
  ('ffff0000-0000-4000-8000-0000000000a1', 1, 'ffff0000-0000-4000-8000-0000000000e1', 0, 'Climate'),
  ('ffff0000-0000-4000-8000-0000000000a1', 2, 'ffff0000-0000-4000-8000-0000000000e2', 0, 'Energy'),
  ('ffff0000-0000-4000-8000-0000000000a1', 2, 'ffff0000-0000-4000-8000-0000000000e1', 1, 'Climate');

/* ---------- Khách đọc Thư viện ---------- */

set local role anon;
select ok(exists (
  select 1 from jsonb_array_elements(public.library_lists()) x
  where x ->> 'id' = 'ffff0000-0000-4000-8000-0000000000a1'),
  'Khách gọi được library_lists(), có danh sách đã xuất bản');
select ok(not exists (
  select 1 from jsonb_array_elements(public.library_lists()) x
  where x ->> 'id' = 'ffff0000-0000-4000-8000-0000000000a2'),
  'Danh sách chưa xuất bản không có trong Thư viện');
select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a1') -> 0 ->> 'version', '2',
  'Theo bản phát hành mới nhất');
select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a1') -> 0 ->> 'word_count', '2',
  'Số từ của bản mới nhất');
select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a1') -> 0 -> 'subtopics',
  '["Energy", "Climate"]'::jsonb, 'Chủ đề con theo thứ tự trong danh sách');
select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a1') -> 0 ->> 'learner_count', '0',
  'Chưa có người học');
select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a2'), '[]'::jsonb,
  'Tra danh sách nháp theo id: không có');
select is((select count(*)::integer from public.curated_list_release_items
  where list_id = 'ffff0000-0000-4000-8000-0000000000a1' and version = 2), 2,
  'Khách đọc được từ của bản phát hành');

/* ---------- Người học thêm danh sách vào sổ ---------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "ffff0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok($$
  insert into public.notebooks (id, user_id, name, source_list_id, source_list_version, target_date)
  values ('ffff0000-0000-4000-8000-0000000000d1', 'ffff0000-0000-4000-8000-000000000001',
    'Thư viện test', 'ffff0000-0000-4000-8000-0000000000a1', 1, current_date + 60)
$$, 'Người học tạo sổ theo danh sách, ghi phiên bản đã nhận và ngày mục tiêu');
select throws_ok($$
  update public.notebooks set source_list_version = 0
  where id = 'ffff0000-0000-4000-8000-0000000000d1'
$$, '23514', null, 'Phiên bản đã nhận phải ≥ 1');

select is(public.library_lists('ffff0000-0000-4000-8000-0000000000a1') -> 0 ->> 'learner_count', '1',
  'Số người học tính cả người vừa thêm');

select set_config('request.jwt.claims',
  '{"sub": "ffff0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::integer from public.notebooks
  where source_list_id = 'ffff0000-0000-4000-8000-0000000000a1'), 0,
  'Người khác không đọc được sổ (chỉ thấy số tổng hợp)');

select * from finish();
rollback;
