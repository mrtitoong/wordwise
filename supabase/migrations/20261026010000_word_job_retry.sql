-- Danh sách "Đang chuẩn bị" (2026-10-26): người dùng bấm "Thử lại" cho từ tạo nội dung bị lỗi.
-- Thử lại không tính thêm vào giới hạn từ mới/ngày (yêu cầu cũ giữ created_at) và không tính lại
-- vào trần hệ thống (first_started_at giữ nguyên). Tối đa 3 lần thử lại cho mỗi việc.

alter table public.word_jobs
  add column user_retries smallint not null default 0 check (user_retries >= 0);

comment on column public.word_jobs.user_retries is
  'Số lần người dùng bấm "Thử lại" sau khi việc lỗi (tối đa 3).';

create function public.retry_word_job(p_job_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_job public.word_jobs;
  v_active uuid;
begin
  if v_user is null or not exists (
    select 1 from public.word_job_requests where job_id = p_job_id and user_id = v_user
  ) then
    return 'not_found';
  end if;

  select * into v_job from public.word_jobs where id = p_job_id for update;
  if v_job.status <> 'failed' then
    return v_job.status;
  end if;
  if v_job.user_retries >= 3 then
    return 'retry_limit';
  end if;

  -- Cùng từ đã có việc khác đang chờ/chạy (người khác vừa thêm): chuyển yêu cầu sang việc đó.
  select id into v_active from public.word_jobs
  where language = v_job.language and lemma = v_job.lemma and pos is not distinct from v_job.pos
    and status in ('queued', 'running');
  if v_active is not null then
    insert into public.word_job_requests
      (job_id, user_id, created_at, notebook_id, context_sentence, context_image_url, input_method,
       user_note, tags, added_at)
    select v_active, user_id, created_at, notebook_id, context_sentence, context_image_url,
           input_method, user_note, tags, added_at
    from public.word_job_requests where job_id = p_job_id and user_id = v_user
    on conflict do nothing;
    delete from public.word_job_requests where job_id = p_job_id and user_id = v_user;
    return 'queued';
  end if;

  update public.word_jobs
  set status = 'queued', attempts = 0, run_after = now(), locked_at = null, finished_at = null,
      last_error = null, user_retries = user_retries + 1
  where id = p_job_id;
  return 'queued';
end;
$$;

revoke all on function public.retry_word_job(uuid) from public, anon;
grant execute on function public.retry_word_job(uuid) to authenticated;
