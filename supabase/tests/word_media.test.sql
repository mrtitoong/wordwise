-- Test audio/ảnh cho thẻ từ (Prompt 2.2): nhận từ thiếu media, khóa tránh làm trùng,
-- giới hạn audio câu mỗi ngày, quyền truy cập.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('66666666-6666-4666-8666-666666666661', 'media@test.local');

-- Đánh dấu các từ seed đã đủ media để chỉ còn từ của bài test.
update public.words set audio_us_url = 'x', audio_uk_url = 'x';
update public.word_senses set image_checked_at = now();

insert into public.words (id, language, lemma, pos, frequency_rank) values
  ('77777777-0000-4000-8000-000000000001', 'en', 'media-rank-5', 'noun', 5),
  ('77777777-0000-4000-8000-000000000002', 'en', 'media-user', 'noun', null),
  ('77777777-0000-4000-8000-000000000003', 'en', 'media-image-only', 'noun', 9);
update public.words set audio_us_url = 'x', audio_uk_url = 'x'
where id = '77777777-0000-4000-8000-000000000003';
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi, image_query) values
  ('77777777-0000-4000-8000-0000000000a3', '77777777-0000-4000-8000-000000000003', 0, 'a thing', 'đồ vật', 'thing');

set local role service_role;

create temp table c1 as select public.claim_media_words(10, false) as c;
select is(jsonb_array_length((select c from c1)), 2, 'Không tìm ảnh → chỉ nhận từ thiếu audio');
select is((select c -> 0 ->> 'lemma' from c1), 'media-user', 'Từ người dùng thêm (không có thứ hạng) được làm trước');
select is((select c -> 1 ->> 'lemma' from c1), 'media-rank-5', 'Rồi đến từ tạo trước theo độ thông dụng');
select isnt(
  (select media_locked_at from public.words where id = '77777777-0000-4000-8000-000000000002'),
  null, 'Từ đã nhận bị khóa');
select is(jsonb_array_length(public.claim_media_words(10, false)), 0, 'Từ đang khóa không bị nhận trùng');

create temp table c2 as select public.claim_media_words(10, true) as c;
select is((select c -> 0 ->> 'lemma' from c2), 'media-image-only', 'Có tìm ảnh → nhận cả từ chỉ thiếu ảnh');
select is((select c -> 0 -> 'senses' -> 0 ->> 'image_query' from c2), 'thing', 'Trả về nghĩa chưa tìm ảnh');

-- Khóa quá 5 phút (worker chết) → nhận lại được.
reset role;
update public.words set media_locked_at = now() - interval '6 minutes'
where id = '77777777-0000-4000-8000-000000000001';
set local role service_role;
select is(public.claim_media_words(10, false) -> 0 ->> 'lemma', 'media-rank-5', 'Khóa quá hạn được nhận lại');

/* ---------- Giới hạn audio câu ---------- */

reset role;
update private.settings set value = 2 where key = 'user_daily_sentence_audio';
set local role service_role;
insert into public.audio_clips (path, kind, voice, chars, created_by) values
  ('en/sentences/aaaa.mp3', 'sentence', 'us', 10, '66666666-6666-4666-8666-666666666661');
select is(
  public.sentence_audio_quota('66666666-6666-4666-8666-666666666661'),
  '{"remaining": 1, "daily_limit": 2}'::jsonb, 'Đếm audio câu đã tạo hôm nay');
select throws_ok(
  $$ insert into public.audio_clips (path, kind, voice, chars) values ('../evil.mp3', 'word', 'us', 1) $$,
  '23514', null, 'Đường dẫn audio phải đúng dạng');

/* ---------- Quyền ---------- */

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "66666666-6666-4666-8666-666666666661", "role": "authenticated"}', true);
select throws_ok($$ select public.claim_media_words(1, true) $$, '42501', null,
  'Người dùng không gọi được hàm worker');
select throws_ok($$ select * from public.audio_clips $$, '42501', null,
  'Người dùng không đọc bảng audio_clips');

select * from finish();
rollback;
