-- Audio và ảnh cho thẻ từ (Prompt 2.2).
--
-- Audio của từ (giọng Mỹ + Anh) và ảnh gợi nhớ cho từng nghĩa được tạo dần trong nền:
-- pg_cron mỗi phút gọi Edge Function word-media, worker nhận vài từ còn thiếu, gọi Azure TTS
-- và Pexels/Unsplash. Audio câu ví dụ chỉ tạo khi có người bấm nghe lần đầu.
-- File MP3 nằm trong bucket công khai "audio"; ảnh dùng thẳng URL của nhà cung cấp (hotlink).

/* ---------- Storage ---------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 1048576, array['audio/mpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
-- Bucket công khai: ai cũng đọc được qua URL /object/public/audio/…; không có policy ghi nên
-- chỉ service role (Edge Function) tải lên được.

/* ---------- Bảng và cột ---------- */

create table public.audio_clips (
  path text primary key check (path ~ '^[a-z]{2}/[a-z0-9_/.-]+\.mp3$'),
  kind text not null check (kind in ('word', 'sentence')),
  voice text not null check (voice in ('us', 'uk')),
  -- Số ký tự gửi cho TTS (theo dõi chi phí).
  chars integer not null check (chars > 0),
  -- Người bấm nghe câu lần đầu (đếm giới hạn mỗi ngày); null với audio của từ.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.audio_clips is
  'File audio đã tạo trong bucket audio. Chỉ service role đọc/ghi.';

create index audio_clips_created_by_idx on public.audio_clips (created_by, created_at)
  where created_by is not null;

alter table public.audio_clips enable row level security;
revoke all on public.audio_clips from anon, authenticated;

-- Khóa tạm khi worker đang làm media cho từ (tránh hai worker gọi TTS trùng).
alter table public.words add column media_locked_at timestamptz;
-- Đã tìm ảnh cho nghĩa này (kể cả khi không có kết quả hoặc cố ý bỏ qua).
alter table public.word_senses add column image_checked_at timestamptz;

create index words_media_missing_idx on public.words (created_at)
  where audio_us_url is null or audio_uk_url is null;
create index word_senses_image_unchecked_idx on public.word_senses (word_id)
  where image_checked_at is null;

insert into private.settings (key, value, note) values
  ('user_daily_sentence_audio', 100, 'Số audio câu ví dụ mới mỗi người được tạo mỗi ngày')
on conflict (key) do nothing;

/* ---------- Hàm cho Edge Function (service role) ---------- */

-- Nhận tối đa p_limit từ còn thiếu audio (hoặc thiếu ảnh nếu p_include_images): từ người
-- dùng thêm (không có frequency_rank) trước, rồi từ tạo trước theo độ thông dụng. Từ đang
-- được worker khác làm (khóa < 5 phút) thì bỏ qua. Trả về mảng JSON.
create function public.claim_media_words(p_limit integer, p_include_images boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_claimed jsonb := '[]';
  v_word public.words;
begin
  for v_word in
    select * from public.words w
    where (w.media_locked_at is null or w.media_locked_at < now() - interval '5 minutes')
      and (
        (w.language = 'en' and (w.audio_us_url is null or w.audio_uk_url is null))
        or (p_include_images and exists (
          select 1 from public.word_senses s where s.word_id = w.id and s.image_checked_at is null
        ))
      )
    order by (w.frequency_rank is null) desc, w.frequency_rank, w.created_at
    limit p_limit
    for update skip locked
  loop
    update public.words set media_locked_at = now() where id = v_word.id;
    v_claimed := v_claimed || jsonb_build_array(jsonb_build_object(
      'id', v_word.id, 'language', v_word.language, 'lemma', v_word.lemma, 'pos', v_word.pos,
      'audio_us_url', v_word.audio_us_url, 'audio_uk_url', v_word.audio_uk_url,
      'senses', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'image_query', s.image_query)
                         order by s.sense_order)
        from public.word_senses s
        where s.word_id = v_word.id and s.image_checked_at is null
      ), '[]'::jsonb)));
  end loop;
  return v_claimed;
end;
$$;

-- Số audio câu ví dụ người dùng còn được tạo hôm nay (giờ Việt Nam).
-- Trả về { remaining, daily_limit }.
create function public.sentence_audio_quota(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'remaining', greatest(private.setting('user_daily_sentence_audio') - count(*)::integer, 0),
    'daily_limit', private.setting('user_daily_sentence_audio'))
  from public.audio_clips
  where created_by = p_user_id and kind = 'sentence' and created_at >= private.vn_day_start();
$$;

revoke all on function
  public.claim_media_words(integer, boolean),
  public.sentence_audio_quota(uuid)
from public, anon, authenticated;
grant execute on function
  public.claim_media_words(integer, boolean),
  public.sentence_audio_quota(uuid)
to service_role;

/* ---------- pg_cron: gọi worker word-media mỗi phút khi còn từ thiếu media ---------- */

create function private.kick_word_media()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'word_worker_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;
  if not exists (
    select 1 from public.words w
    where (w.media_locked_at is null or w.media_locked_at < now() - interval '5 minutes')
      and ((w.language = 'en' and (w.audio_us_url is null or w.audio_uk_url is null))
        or exists (select 1 from public.word_senses s
                   where s.word_id = w.id and s.image_checked_at is null))
  ) then
    return 0;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/word-media',
    body := '{"action": "work"}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    timeout_milliseconds := 5000);
  return 1;
end;
$$;

revoke all on function private.kick_word_media() from public, anon, authenticated;

select cron.schedule('word-media', '* * * * *', 'select private.kick_word_media()');
