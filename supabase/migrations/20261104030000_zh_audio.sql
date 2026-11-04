-- Worker audio nhận từ tiếng Trung: chỉ một giọng (Xiaoxiao, lưu ở audio_us_url) nên không chờ cột
-- audio_uk_url. Điều kiện của tiếng Anh giữ nguyên.

/* ---------- Chọn từ cần media ---------- */

-- Như bản ở 20261023030000_list_pipeline.sql, thêm điều kiện tiếng Trung.
create or replace function public.claim_media_words(p_limit integer, p_include_images boolean)
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
        or (w.language = 'zh' and w.audio_us_url is null)
        or (p_include_images and exists (
          select 1 from public.word_senses s where s.word_id = w.id and s.image_checked_at is null
        ))
      )
    order by
      exists (select 1 from public.word_jobs j where j.word_id = w.id and j.source = 'admin') desc,
      (w.frequency_rank is null) desc, w.frequency_rank, w.created_at
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

/* ---------- pg_cron gọi worker ---------- */

-- Như bản ở 20261021030000_word_media.sql, thêm điều kiện tiếng Trung.
create or replace function private.kick_word_media()
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
        or (w.language = 'zh' and w.audio_us_url is null)
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
