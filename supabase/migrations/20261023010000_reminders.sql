-- Nhắc học bằng Web Push (Prompt 6.3): đăng ký nhận thông báo của từng trình duyệt, chọn người
-- cần nhắc (đến giờ nhắc, hôm đó chưa học, tối đa 1 lần/ngày) và gọi Edge Function send-reminders
-- mỗi 5 phút.

/* ---------- Đăng ký nhận thông báo (mỗi trình duyệt một dòng) ---------- */

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

comment on table public.push_subscriptions is
  'Web Push: địa chỉ nhận thông báo của từng trình duyệt. Ghi qua save_push_subscription().';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: đọc của mình"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions: xóa của mình"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;
revoke insert, update, truncate on public.push_subscriptions from authenticated;

-- Lưu đăng ký của trình duyệt cho người đang đăng nhập. Cùng endpoint (máy dùng chung, đổi tài
-- khoản) thì chuyển sang người mới để người cũ không nhận nhắc trên máy này nữa.
create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'login_required' using errcode = '42501';
  end if;
  -- Mỗi người tối đa 10 trình duyệt: bỏ cái cũ nhất.
  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = v_user and endpoint <> p_endpoint
    order by created_at desc offset 9);
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

/* ---------- Chọn người cần nhắc ---------- */

-- Ngày đã nhắc (tối đa 1 lần/ngày theo giờ của người dùng). Chỉ máy chủ ghi.
create table private.reminders_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Người cần nhắc lúc p_now: đã tới giờ nhắc (trễ tối đa 3 giờ, phòng khi cron lỡ một lượt), có
-- trình duyệt nhận thông báo, hôm nay chưa nhắc, chưa ôn câu nào trong ngày học hiện tại (bắt đầu
-- 4:00) và có việc để học. Ghi luôn "đã nhắc" để hai lần gọi cùng lúc không gửi trùng.
-- reviews: thẻ đã ôn đến hạn trong ngày học (theo kỹ năng đang bật); news: từ mới đã mở chưa học,
-- tối đa số từ mới/ngày. Chỉ service role (Edge Function) gọi.
create function public.claim_due_reminders(p_now timestamptz default now())
returns table (user_id uuid, reviews integer, news integer, locale text)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select
      s.user_id,
      s.ui_locale,
      s.daily_new_limit,
      s.practice_spelling,
      s.practice_speaking,
      (p_now at time zone s.timezone) as local_now,
      s.reminder_time,
      s.timezone
    from public.user_settings s
    where s.reminder_time is not null
      and exists (select 1 from public.push_subscriptions p where p.user_id = s.user_id)
  ),
  timed as (
    select
      c.*,
      c.local_now::date as local_day,
      -- Bắt đầu ngày học (4:00 sáng) theo giờ của người dùng.
      ((case when c.local_now::time >= time '04:00' then c.local_now::date
             else c.local_now::date - 1 end) + time '04:00') at time zone c.timezone as day_start
    from candidates c
    where c.local_now - (c.local_now::date + c.reminder_time) between interval '0' and interval '3 hours'
  ),
  counted as (
    select
      t.user_id,
      t.local_day,
      t.ui_locale,
      (select count(*)::integer
       from public.cards c
       join public.user_words w on w.id = c.user_word_id
       where c.user_id = t.user_id and c.deleted_at is null and c.state <> 0
         and c.due < t.day_start + interval '1 day'
         and w.deleted_at is null and w.status = 'learning'
         and (c.skill = 'meaning'
              or (c.skill = 'spelling' and t.practice_spelling)
              or (c.skill = 'speaking' and t.practice_speaking))) as reviews,
      least(t.daily_new_limit,
        (select count(*)::integer
         from public.cards c
         join public.user_words w on w.id = c.user_word_id
         where c.user_id = t.user_id and c.deleted_at is null and c.state = 0
           and c.skill = 'meaning' and w.deleted_at is null and w.status = 'learning')) as news
    from timed t
    where not exists (
        select 1 from private.reminders_sent r
        where r.user_id = t.user_id and r.day = t.local_day)
      and not exists (
        select 1 from public.review_logs l
        where l.user_id = t.user_id and l.reviewed_at >= t.day_start and l.reviewed_at <= p_now)
  ),
  claimed as (
    insert into private.reminders_sent (user_id, day)
    select c.user_id, c.local_day from counted c where c.reviews + c.news > 0
    on conflict do nothing
    returning reminders_sent.user_id
  )
  select c.user_id, c.reviews, c.news, c.ui_locale
  from counted c
  join claimed using (user_id);
$$;

revoke all on function public.claim_due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz) to service_role;

/* ---------- pg_cron: gọi send-reminders mỗi 5 phút ---------- */

create function private.kick_send_reminders()
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
  -- Chưa ai bật nhắc học thì khỏi gọi.
  if not exists (select 1 from public.push_subscriptions) then
    return 0;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-reminders',
    body := '{"action": "work"}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
    timeout_milliseconds := 5000);
  return 1;
end;
$$;

revoke all on function private.kick_send_reminders() from public, anon, authenticated;

select cron.schedule('send-reminders', '*/5 * * * *', 'select private.kick_send_reminders()');
