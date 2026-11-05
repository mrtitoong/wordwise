-- Test tìm từ tiếng Trung theo pinyin: khóa bỏ thanh, từ trong kho xếp trước, âm ít dùng xếp sau.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into public.zh_lexicon (simplified, traditional, pinyin, common) values
  ('学校', '學校', 'xue2 xiao4', true),
  ('学效', '學效', 'xue2 xiao4', false),
  ('绿', '綠', 'lu:4', true),
  ('世', '世', 'shi4', true),
  ('是', '是', 'shi4', true);
insert into public.zh_han_viet (char, readings, level)
  values ('学', '[]', 1), ('校', '[]', 1), ('世', '[]', 3), ('是', '[]', 1);
insert into public.words (id, language, lemma, pos)
  values ('00000000-0000-4000-8000-0000000000a1', 'zh', '学效', 'noun');
insert into public.word_senses (word_id, sense_order, definition_en, meaning_vi)
  values ('00000000-0000-4000-8000-0000000000a1', 0, 'test', 'thử');

select is(
  (select pinyin_key from public.zh_lexicon where simplified = '学校'),
  'xuexiao', 'Khóa bỏ thanh và dấu cách');
select is(
  (select pinyin_key from public.zh_lexicon where simplified = '绿'),
  'lv', 'ü viết thành v');

set local role anon;
select is(
  public.search_zh_pinyin('xuexiao') -> 0 ->> 'lemma',
  '学效', 'Từ trong kho xếp trước, khách tìm được');
select is(
  public.search_zh_pinyin('xuexiao') -> 1 ->> 'lemma',
  '学校', 'Từ chưa có trong kho vẫn hiện, không có nghĩa');
select is(
  jsonb_array_length(public.search_zh_pinyin('xuexiao') -> 1 -> 'words'),
  0, 'Từ ngoài kho không có nội dung');
select is(
  public.search_zh_pinyin('shi') -> 0 ->> 'lemma',
  '是', 'Chữ cấp thấp xếp trước');
select is(public.search_zh_pinyin('123'), '[]'::jsonb, 'Không có chữ Latin thì không tìm');
reset role;

select * from finish();
rollback;
