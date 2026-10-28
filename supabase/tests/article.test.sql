-- Test tab Link: cách nhập 'url' dùng được với gói Free, link/tiêu đề bài viết của từ mới đi vào
-- sổ khi tạo xong, giới hạn 20 bài/ngày, ràng buộc link phải là http(s).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('abab0000-0000-4000-8000-000000000001', 'article-free@test.local');
insert into public.notebooks (id, user_id, name) values
  ('abab0000-0000-4000-8000-0000000000b1', 'abab0000-0000-4000-8000-000000000001', 'Đọc báo');

set local role service_role;

select is(
  public.request_word_job('abab0000-0000-4000-8000-000000000001', 'en', 'art-word', null,
    'abab0000-0000-4000-8000-0000000000b1', 'Floods test resilient towns.', 'url', null, '{}',
    null, 'https://news.example/floods', 'Flood lessons') ->> 'premium_required',
  'false', 'Free thêm từ mới từ bài viết được');

select is(
  (select source_url || ' | ' || source_title from public.word_job_requests
   where user_id = 'abab0000-0000-4000-8000-000000000001'),
  'https://news.example/floods | Flood lessons', 'Yêu cầu giữ link và tiêu đề bài');

select is(
  public.request_word_job('abab0000-0000-4000-8000-000000000001', 'en', 'art-bad', null,
    'abab0000-0000-4000-8000-0000000000b1', null, 'url', null, '{}', null,
    'javascript:alert(1)', 'x') ->> 'premium_required',
  'false', 'Link không phải http(s) vẫn tạo việc…');
select is(
  (select coalesce(source_url, 'null') || ':' || coalesce(source_title, 'null')
   from public.word_job_requests r join public.word_jobs j on j.id = r.job_id
   where j.lemma = 'art-bad'),
  'null:null', '…nhưng bỏ link');

reset role;
insert into public.words (id, language, lemma, pos) values
  ('abab0000-0000-4000-8000-0000000000a1', 'en', 'art-word', 'noun');
insert into public.word_senses (id, word_id, sense_order, definition_en, meaning_vi) values
  ('abab0000-0000-4000-8000-0000000000c1', 'abab0000-0000-4000-8000-0000000000a1', 0, 'x', 'y');

set local role service_role;
select public.complete_word_job(
  (select id from public.word_jobs where lemma = 'art-word'), 'abab0000-0000-4000-8000-0000000000a1');

select is(
  (select input_method || ' | ' || source_url || ' | ' || source_title || ' | ' || context_sentence
   from public.notebook_entries where user_id = 'abab0000-0000-4000-8000-000000000001'),
  'url | https://news.example/floods | Flood lessons | Floods test resilient towns.',
  'Mục trong sổ có cách nhập url, link, tiêu đề và câu gốc');

reset role;
select throws_ok(
  $$update public.notebook_entries set source_url = 'file:///etc/passwd'
    where user_id = 'abab0000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Ràng buộc chỉ nhận link http(s)');

set local role service_role;
select is(
  (select bool_and((public.consume_usage('abab0000-0000-4000-8000-000000000001', 'article') ->> 'allowed')::boolean)
   from generate_series(1, 20)),
  true, '20 bài đầu trong ngày được đọc');
select is(
  public.consume_usage('abab0000-0000-4000-8000-000000000001', 'article') ->> 'allowed',
  'false', 'Bài thứ 21 hết lượt');

select * from finish();
rollback;
