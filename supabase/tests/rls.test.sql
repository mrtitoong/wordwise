-- Test RLS và ràng buộc dữ liệu. Chạy: supabase test db (CI).
-- Mỗi test chạy trong transaction và rollback ở cuối.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------- Chuẩn bị (quyền postgres) ----------
-- A, B: người dùng thường; C: admin.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'b@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'c@test.local');
update public.profiles set role = 'admin' where user_id = '33333333-3333-4333-8333-333333333333';

insert into public.words (id, language, lemma, pos) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'en', 'rls-test-word', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 0, 'a test', 'từ thử');

insert into public.curated_lists (id, title, language, status) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Draft list', 'en', 'draft'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Published list', 'en', 'published');
insert into public.curated_list_items (list_id, sense_id, item_order) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 0);

select is(
  (select count(*) from public.profiles where user_id in (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2::bigint, 'Đăng ký tự tạo profiles');
select is(
  (select count(*) from public.user_settings where user_id = '11111111-1111-4111-8111-111111111111'
     and daily_new_limit = 10 and ui_locale = 'vi'),
  1::bigint, 'Đăng ký tự tạo user_settings với giá trị mặc định');

-- ---------- Người dùng A tạo dữ liệu học ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select lives_ok($$
  insert into public.notebooks (id, user_id, name)
  values ('cccccccc-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'Sổ của A')
$$, 'A tạo sổ tay của mình');
select lives_ok($$
  insert into public.user_words (id, user_id, sense_id)
  values ('cccccccc-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002')
$$, 'A thêm từ vào kho');
select lives_ok($$
  insert into public.notebook_entries (user_id, notebook_id, user_word_id, input_method)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000a', 'cccccccc-0000-4000-8000-00000000000b', 'typed')
$$, 'A gắn từ vào sổ tay');
select lives_ok($$
  insert into public.cards (id, user_id, user_word_id, skill)
  values ('cccccccc-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000b', 'meaning')
$$, 'A tạo thẻ ôn');
select lives_ok($$
  insert into public.review_logs (id, user_id, card_id, mode, rating, state, reviewed_at)
  values ('cccccccc-0000-4000-8000-00000000000d', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000c', 'flashcard', 3, 0, now())
$$, 'A ghi lượt ôn');
select is((select count(*) from public.cards), 1::bigint, 'A thấy thẻ của mình');

select throws_ok($$
  insert into public.user_words (user_id, sense_id)
  values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002')
$$, '23505', null, 'Một nghĩa chỉ có một user_words mỗi người (một lịch ôn)');

select throws_ok($$
  update public.review_logs set rating = 4 where id = 'cccccccc-0000-4000-8000-00000000000d'
$$, '42501', null, 'review_logs: không sửa được');
select throws_ok($$
  delete from public.review_logs where id = 'cccccccc-0000-4000-8000-00000000000d'
$$, '42501', null, 'review_logs: không xóa được');

-- ---------- Người dùng B không chạm được dữ liệu của A ----------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

select is((select count(*) from public.cards), 0::bigint, 'B không đọc được cards của A');
select is((select count(*) from public.review_logs), 0::bigint, 'B không đọc được review_logs của A');
select is((select count(*) from public.notebooks), 0::bigint, 'B không đọc được sổ tay của A');
select is((select count(*) from public.user_settings), 1::bigint, 'B chỉ thấy user_settings của chính mình');

select results_eq($$
  with u as (
    update public.notebooks set name = 'bị sửa' where id = 'cccccccc-0000-4000-8000-00000000000a' returning 1
  ) select count(*) from u
$$, $$ values (0::bigint) $$, 'B không sửa được sổ tay của A');

select throws_ok($$
  insert into public.cards (user_id, user_word_id, skill)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000b', 'spelling')
$$, '42501', null, 'B không tạo được thẻ đứng tên A');
select throws_ok($$
  insert into public.cards (user_id, user_word_id, skill)
  values ('22222222-2222-4222-8222-222222222222', 'cccccccc-0000-4000-8000-00000000000b', 'spelling')
$$, '23503', null, 'B không gắn được thẻ của mình vào từ của A');

select throws_ok($$
  insert into public.curated_lists (title, language) values ('Danh sách của B', 'en')
$$, '42501', null, 'Người dùng thường không ghi được curated_lists');
select is((select count(*) from public.curated_lists), 1::bigint, 'Người dùng chỉ thấy danh sách đã xuất bản');
select is((select count(*) from public.curated_list_items), 0::bigint, 'Không thấy mục của danh sách nháp');

select throws_ok($$
  insert into public.words (language, lemma, pos) values ('en', 'hack', 'noun')
$$, '42501', null, 'Người dùng không ghi được nội dung từ chung');
select throws_ok($$
  update public.profiles set role = 'admin' where user_id = '22222222-2222-4222-8222-222222222222'
$$, '42501', null, 'Người dùng không tự nâng vai trò admin');
select lives_ok($$
  update public.profiles set display_name = 'Bình' where user_id = '22222222-2222-4222-8222-222222222222'
$$, 'Người dùng sửa được tên hiển thị');
select throws_ok($$
  insert into public.import_jobs (user_id, kind) values ('22222222-2222-4222-8222-222222222222', 'admin_list')
$$, '42501', null, 'Người dùng thường không tạo được việc phân tích danh sách Admin');

-- ---------- Admin C ----------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);

select lives_ok($$
  insert into public.curated_lists (title, language) values ('Danh sách của admin', 'en')
$$, 'Admin tạo được curated_lists');
select is((select count(*) from public.curated_lists where title in ('Draft list', 'Published list', 'Danh sách của admin')),
  3::bigint, 'Admin thấy cả danh sách nháp');
select is((select count(*) from public.cards), 0::bigint, 'Admin cũng không đọc được thẻ ôn của người khác');

-- ---------- Khách chưa đăng nhập ----------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select is((select count(*) from public.words where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  1::bigint, 'Khách đọc được nội dung từ');
select throws_ok($$ select count(*) from public.cards $$, '42501', null, 'Khách không đọc được bảng cards');

-- ---------- Ràng buộc xóa (postgres) ----------
reset role;

select throws_ok($$
  delete from public.word_senses where id = 'aaaaaaaa-0000-4000-8000-000000000002'
$$, '23503', null, 'Không xóa được nghĩa đang có người học');

delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*) from public.cards where user_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*) from public.review_logs where user_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*) from public.notebooks where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint, 'Xóa tài khoản xóa sạch dữ liệu cá nhân');

select * from finish();
rollback;
