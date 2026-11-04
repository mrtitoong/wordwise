-- Test lưu từ tiếng Trung: loại từ mới được nhận, bảng âm đọc ai cũng đọc, không ai ngoài máy chủ ghi.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select lives_ok($$
  insert into public.words (language, lemma, pos) values ('zh', '个', 'classifier')
$$, 'Lưu được lượng từ');
select lives_ok($$
  insert into public.word_jobs (language, lemma, pos, source) values ('zh', '的', 'particle', 'bulk')
$$, 'Xếp việc được cho trợ từ');
select throws_ok($$
  insert into public.words (language, lemma, pos) values ('zh', '三', 'khác')
$$, '23514', null, 'Loại từ lạ vẫn bị chặn');

insert into public.zh_lexicon (simplified, traditional, pinyin, common)
  values ('看', '看', 'kan4', true);

set local role anon;
select is(
  (select pinyin from public.zh_lexicon where simplified = '看'),
  'kan4', 'Khách đọc được âm đọc');
reset role;

set local role authenticated;
select throws_ok($$
  insert into public.zh_lexicon (simplified, traditional, pinyin, common)
    values ('好', '好', 'hao3', true)
$$, '42501', null, 'Người dùng không ghi được');
select throws_ok($$ delete from public.zh_lexicon $$, '42501', null, 'Người dùng không xóa được');

select * from finish();
rollback;
