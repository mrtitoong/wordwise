-- Test Prompt 7.3: duyệt, xuất bản, phiên bản, Admin sửa nội dung từ, thống kê danh sách.
begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

insert into auth.users (id, email) values
  ('eeee0000-0000-4000-8000-000000000001', 'review-admin@test.local'),
  ('eeee0000-0000-4000-8000-000000000002', 'review-user@test.local');
update public.profiles set role = 'admin' where user_id = 'eeee0000-0000-4000-8000-000000000001';

-- Hai từ riêng của test (không trùng seed): zzreview (2 nghĩa) và zzother.
insert into public.words (id, language, lemma, pos, ipa_us, cefr, register) values
  ('eeee0000-0000-4000-8000-0000000000f1', 'en', 'zzreview', 'noun', 'ri', 'B1', 'neutral'),
  ('eeee0000-0000-4000-8000-0000000000f2', 'en', 'zzother', 'verb', 'oo', 'B2', 'neutral');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('eeee0000-0000-4000-8000-0000000000e1', 'eeee0000-0000-4000-8000-0000000000f1', 0, 'one', 'một'),
  ('eeee0000-0000-4000-8000-0000000000e2', 'eeee0000-0000-4000-8000-0000000000f1', 1, 'two', 'hai'),
  ('eeee0000-0000-4000-8000-0000000000e3', 'eeee0000-0000-4000-8000-0000000000f2', 0, 'three', 'ba');
insert into public.word_details (sense_id) values
  ('eeee0000-0000-4000-8000-0000000000e1'),
  ('eeee0000-0000-4000-8000-0000000000e2'),
  ('eeee0000-0000-4000-8000-0000000000e3');

insert into public.curated_lists (id, title, language, status) values
  ('eeee0000-0000-4000-8000-0000000000a1', 'Danh sách duyệt', 'en', 'review');
insert into public.curated_list_items (id, list_id, sense_id, item_order, warnings) values
  ('eeee0000-0000-4000-8000-0000000000b1', 'eeee0000-0000-4000-8000-0000000000a1',
   'eeee0000-0000-4000-8000-0000000000e1', 0, '[{"code": "no_context"}, {"code": "rare"}]'),
  ('eeee0000-0000-4000-8000-0000000000b2', 'eeee0000-0000-4000-8000-0000000000a1',
   'eeee0000-0000-4000-8000-0000000000e3', 1, '[]');

/* ---------- Người dùng thường bị chặn ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select throws_ok($$ select public.admin_publish_list('eeee0000-0000-4000-8000-0000000000a1') $$,
  '42501', 'admin_required', 'Người dùng thường không xuất bản được');
select throws_ok($$ select public.admin_accept_list_items('eeee0000-0000-4000-8000-0000000000a1', null, true) $$,
  '42501', 'admin_required', 'Người dùng thường không chấp nhận mục được');
select throws_ok($$ select public.admin_save_word('eeee0000-0000-4000-8000-0000000000f1', '{}', '[]', '[]') $$,
  '42501', 'admin_required', 'Người dùng thường không sửa nội dung từ được');
select throws_ok($$ select public.admin_list_stats('eeee0000-0000-4000-8000-0000000000a1') $$,
  '42501', 'admin_required', 'Người dùng thường không xem thống kê được');
select is((select count(*)::int from public.curated_list_items), 0, 'Người dùng thường không đọc bản làm việc');

/* ---------- Admin duyệt và xuất bản bản 1 ---------- */

select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok($$ select public.admin_reorder_list_items('eeee0000-0000-4000-8000-0000000000a1',
  array['eeee0000-0000-4000-8000-0000000000b2', 'eeee0000-0000-4000-8000-0000000000b1']::uuid[]) $$,
  'Admin đổi thứ tự');
select is((select item_order from public.curated_list_items where id = 'eeee0000-0000-4000-8000-0000000000b1'), 1,
  'Thứ tự mới được lưu');
select throws_ok($$ select public.admin_reorder_list_items('eeee0000-0000-4000-8000-0000000000a1',
  array['eeee0000-0000-4000-8000-0000000000b2']::uuid[]) $$,
  '22023', 'items_mismatch', 'Thiếu mục khi đổi thứ tự → lỗi');

select is(public.admin_accept_list_items('eeee0000-0000-4000-8000-0000000000a1', null, true), 1,
  '"Chấp nhận tất cả" chỉ lấy mục không có cảnh báo');
select throws_ok($$ select public.admin_publish_list('eeee0000-0000-4000-8000-0000000000a1') $$,
  '22023', 'items_not_accepted', 'Còn mục chưa chấp nhận → không xuất bản được');

select lives_ok($$ select public.admin_set_item_sense('eeee0000-0000-4000-8000-0000000000a1',
  'eeee0000-0000-4000-8000-0000000000b1', 'eeee0000-0000-4000-8000-0000000000e2') $$,
  'Admin đổi sang nghĩa khác của cùng từ');
select is((select warnings from public.curated_list_items where id = 'eeee0000-0000-4000-8000-0000000000b1'),
  '[{"code": "rare"}]'::jsonb, 'Đổi nghĩa bỏ cảnh báo về cách chọn nghĩa');
select throws_ok($$ select public.admin_set_item_sense('eeee0000-0000-4000-8000-0000000000a1',
  'eeee0000-0000-4000-8000-0000000000b1', 'eeee0000-0000-4000-8000-0000000000e3') $$,
  '22023', 'sense_of_other_word', 'Không đổi sang nghĩa của từ khác');

select is(public.admin_accept_list_items('eeee0000-0000-4000-8000-0000000000a1',
  array['eeee0000-0000-4000-8000-0000000000b1']::uuid[], true), 1, 'Chấp nhận từng mục');
select is(public.admin_publish_list('eeee0000-0000-4000-8000-0000000000a1'), 1, 'Xuất bản lần đầu là phiên bản 1');
select is((select status || ':' || version from public.curated_lists where id = 'eeee0000-0000-4000-8000-0000000000a1'),
  'published:1', 'Danh sách Đã xuất bản, v1');
select throws_ok($$ select public.admin_remove_list_item('eeee0000-0000-4000-8000-0000000000a1',
  'eeee0000-0000-4000-8000-0000000000b1') $$,
  '55000', 'list_locked', 'Danh sách đã xuất bản không sửa trực tiếp được');

/* ---------- Người học thấy bản đã xuất bản ---------- */

select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.curated_list_release_items
  where list_id = 'eeee0000-0000-4000-8000-0000000000a1'), 2, 'Người học đọc được mục đã xuất bản');

/* ---------- Sửa bản đã xuất bản → phiên bản 2 ---------- */

select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select lives_ok($$ select public.admin_open_list_draft('eeee0000-0000-4000-8000-0000000000a1') $$,
  'Admin mở bản nháp');
select lives_ok($$ select public.admin_remove_list_item('eeee0000-0000-4000-8000-0000000000a1',
  'eeee0000-0000-4000-8000-0000000000b2') $$, 'Admin bỏ một từ');
select is((select item_order from public.curated_list_items where id = 'eeee0000-0000-4000-8000-0000000000b1'), 0,
  'Bỏ từ thì đánh số lại');

select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is((select count(*)::int from public.curated_lists where id = 'eeee0000-0000-4000-8000-0000000000a1'), 1,
  'Người học vẫn thấy danh sách khi Admin đang sửa');

select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select lives_ok($$ select public.admin_discard_list_draft('eeee0000-0000-4000-8000-0000000000a1') $$,
  'Hủy bản nháp');
select is((select count(*)::int from public.curated_list_items
  where list_id = 'eeee0000-0000-4000-8000-0000000000a1' and accepted), 2,
  'Hủy bản nháp khôi phục đúng phiên bản đã xuất bản');

select lives_ok($$ select public.admin_open_list_draft('eeee0000-0000-4000-8000-0000000000a1') $$, 'Mở bản nháp lần 2');
select lives_ok($$ select public.admin_remove_list_item('eeee0000-0000-4000-8000-0000000000a1',
  'eeee0000-0000-4000-8000-0000000000b2') $$, 'Bỏ từ ở bản nháp lần 2');
select is(public.admin_publish_list('eeee0000-0000-4000-8000-0000000000a1'), 2, 'Xuất bản lại → phiên bản 2');
select is((select removed_sense_ids from public.curated_list_releases
  where list_id = 'eeee0000-0000-4000-8000-0000000000a1' and version = 2),
  array['eeee0000-0000-4000-8000-0000000000e3']::uuid[], 'Ghi lại từ bị bỏ ở phiên bản 2');
select is((select cardinality(added_sense_ids) from public.curated_list_releases
  where list_id = 'eeee0000-0000-4000-8000-0000000000a1' and version = 2), 0, 'Phiên bản 2 không thêm từ');

/* ---------- Admin sửa nội dung từ ---------- */

select throws_ok($$ select public.admin_save_word('eeee0000-0000-4000-8000-0000000000f1', '{}',
  '[{"id": "eeee0000-0000-4000-8000-0000000000e1"}]', '[{"sense_id": "eeee0000-0000-4000-8000-0000000000e1"}]') $$,
  '22023', 'senses_mismatch', 'Thiếu nghĩa khi lưu → lỗi');
select lives_ok($$ select public.admin_save_word('eeee0000-0000-4000-8000-0000000000f1',
  '{"ipa_us": "rɪ", "ipa_uk": null, "cefr": "B2", "register": "neutral",
    "forms": {"inflections": [], "variants": []}, "details": {"mnemonics": []}}',
  '[{"id": "eeee0000-0000-4000-8000-0000000000e1", "definition_en": "one", "meaning_vi": "một (đã sửa)", "image_query": "one"},
    {"id": "eeee0000-0000-4000-8000-0000000000e2", "definition_en": "two", "meaning_vi": "hai", "image_query": "two"}]',
  '[{"sense_id": "eeee0000-0000-4000-8000-0000000000e1", "examples": [], "synonyms": [], "antonyms": [],
     "collocations": [], "idioms": [], "common_mistakes": []},
    {"sense_id": "eeee0000-0000-4000-8000-0000000000e2", "examples": [], "synonyms": [], "antonyms": [],
     "collocations": [], "idioms": [], "common_mistakes": []}]') $$,
  'Admin lưu nội dung từ');
select is((select meaning_vi from public.word_senses where id = 'eeee0000-0000-4000-8000-0000000000e1'),
  'một (đã sửa)', 'Nghĩa đã sửa được lưu');
select ok((select reviewed and content_updated_at is not null from public.words
  where id = 'eeee0000-0000-4000-8000-0000000000f1'), 'Từ đã sửa được đánh dấu reviewed và content_updated_at');

/* ---------- Thống kê ---------- */

reset role;
-- Người học có sổ từ danh sách, đã học nghĩa s2 (Đã thuộc) và Quên 2 lần.
insert into public.notebooks (id, user_id, name, source_list_id) values
  ('eeee0000-0000-4000-8000-0000000000d1', 'eeee0000-0000-4000-8000-000000000002', 'Danh sách duyệt',
   'eeee0000-0000-4000-8000-0000000000a1');
insert into public.user_words (id, user_id, sense_id, status) values
  ('eeee0000-0000-4000-8000-0000000000d2', 'eeee0000-0000-4000-8000-000000000002',
   'eeee0000-0000-4000-8000-0000000000e2', 'learning');
insert into public.cards (id, user_id, user_word_id, skill, state, stability, last_review) values
  ('eeee0000-0000-4000-8000-0000000000cc', 'eeee0000-0000-4000-8000-000000000002',
   'eeee0000-0000-4000-8000-0000000000d2', 'meaning', 2, 10, now());
insert into public.review_logs (user_id, card_id, mode, rating, state, reviewed_at) values
  ('eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-0000000000cc', 'flashcard', 1, 2, now() - interval '2 days'),
  ('eeee0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-0000000000cc', 'mcq', 1, 3, now() - interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "eeee0000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is(public.admin_list_stats('eeee0000-0000-4000-8000-0000000000a1') - 'top_forgotten',
  '{"version": 2, "word_count": 1, "learners": 1, "completed_learners": 1, "avg_started": 1.0000, "avg_known": 1.0000}'::jsonb,
  'Thống kê: số người học, hoàn thành, đã thuộc');
select is(public.admin_list_stats('eeee0000-0000-4000-8000-0000000000a1') #>> '{top_forgotten,0,lapses}', '2',
  'Thống kê: từ hay quên nhất đếm lượt Quên');

select * from finish();
rollback;
