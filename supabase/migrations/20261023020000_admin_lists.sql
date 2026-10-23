-- Khu Admin và tải danh sách (Prompt 7.1): mô tả danh sách, nguồn từ (bảng CSV/Excel, dán văn bản,
-- bài đọc), bắt đầu/chạy lại phân tích (import_jobs kind = 'admin_list', worker ở Prompt 7.2),
-- tổng quan danh sách cho Admin, ảnh bìa.

alter table public.curated_lists
  add column description text check (char_length(description) <= 1000);

/* ---------- Nguồn từ của danh sách (chỉ Admin) ---------- */

-- kind: rows – các dòng từ bảng CSV/Excel đã ánh xạ cột ({ word, meaning, example, note, tags }[]);
-- lines – dán văn bản, mỗi dòng một từ; document – chữ trích từ bài đọc/đề thi (PDF, ảnh, văn bản).
create table public.curated_list_sources (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.curated_lists (id) on delete cascade,
  kind text not null check (kind in ('rows', 'lines', 'document')),
  name text check (char_length(name) <= 200),
  content jsonb not null check (pg_column_size(content) <= 2097152),
  item_count integer not null default 0 check (item_count between 0 and 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.curated_list_sources is
  'Nguồn từ Admin tải lên cho một danh sách; pipeline phân tích (Prompt 7.2) đọc từ đây.';

create index curated_list_sources_list_idx on public.curated_list_sources (list_id, created_at);

alter table public.curated_list_sources enable row level security;

create policy "curated_list_sources: admin"
  on public.curated_list_sources for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.curated_list_sources from anon;

/* ---------- Việc phân tích danh sách ---------- */

-- step: bước đang/sẽ chạy; lỗi thì giữ bước lỗi để chạy lại từ đó. Chi phí token cộng dồn.
alter table public.import_jobs
  add column step text not null default 'extract'
    check (step in ('extract', 'normalize', 'sense', 'content', 'order', 'warn', 'done')),
  add column options jsonb not null default '{}' check (jsonb_typeof(options) = 'object'),
  add column input_tokens bigint not null default 0 check (input_tokens >= 0),
  add column output_tokens bigint not null default 0 check (output_tokens >= 0),
  add column cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add constraint import_jobs_admin_list_has_list check (kind <> 'admin_list' or list_id is not null);

-- Bắt đầu phân tích: danh sách đang Nháp (hoặc Chờ duyệt, phân tích lại) và có nguồn từ. Danh sách
-- chuyển sang Đang xử lý. options: { min_cefr?: 'A1'…'C2' } (chỉ lấy từ từ cấp này trở lên).
create function public.start_list_analysis(p_list_id uuid, p_options jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_total integer;
  v_job uuid;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select status into v_status from public.curated_lists where id = p_list_id for update;
  if v_status is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'review') then
    raise exception 'list_busy' using errcode = '55000';
  end if;
  select coalesce(sum(item_count), 0) into v_total
  from public.curated_list_sources where list_id = p_list_id;
  if not exists (select 1 from public.curated_list_sources where list_id = p_list_id) then
    raise exception 'no_sources' using errcode = '22023';
  end if;
  if p_options ? 'min_cefr' and p_options ->> 'min_cefr' not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then
    raise exception 'invalid_options' using errcode = '22023';
  end if;
  insert into public.import_jobs (user_id, kind, list_id, total, options)
  values (auth.uid(), 'admin_list', p_list_id, v_total, coalesce(p_options, '{}'))
  returning id into v_job;
  update public.curated_lists set status = 'processing' where id = p_list_id;
  return v_job;
end;
$$;

-- Chạy lại từ bước lỗi: việc đã lỗi trở về hàng đợi, giữ nguyên bước và kết quả các bước trước.
create function public.retry_list_analysis(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  update public.import_jobs
  set status = 'queued', finished_at = null
  where id = p_job_id and kind = 'admin_list' and status = 'failed';
  if not found then
    raise exception 'job_not_retryable' using errcode = '55000';
  end if;
  update public.curated_lists l set status = 'processing'
  from public.import_jobs j where j.id = p_job_id and l.id = j.list_id;
end;
$$;

revoke all on function public.start_list_analysis(uuid, jsonb), public.retry_list_analysis(uuid)
  from public, anon;
grant execute on function public.start_list_analysis(uuid, jsonb), public.retry_list_analysis(uuid)
  to authenticated;

/* ---------- Tổng quan danh sách cho Admin ---------- */

-- Mỗi danh sách: số từ, số nguồn, số người học (sổ tay còn dùng có source_list_id), việc phân tích
-- mới nhất. Chỉ trả số tổng hợp, không có dữ liệu riêng của người học.
create function public.admin_list_overview()
returns table (
  id uuid,
  title text,
  language text,
  target_cefr text,
  status text,
  version integer,
  updated_at timestamptz,
  item_count integer,
  source_count integer,
  learner_count integer,
  job_id uuid,
  job_status text,
  job_step text,
  job_done integer,
  job_total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return query
  select
    l.id, l.title, l.language, l.target_cefr, l.status, l.version, l.updated_at,
    (select count(*)::integer from public.curated_list_items i where i.list_id = l.id),
    (select count(*)::integer from public.curated_list_sources s where s.list_id = l.id),
    (select count(distinct n.user_id)::integer from public.notebooks n
     where n.source_list_id = l.id and n.deleted_at is null),
    j.id, j.status, j.step, j.done, j.total
  from public.curated_lists l
  left join lateral (
    select * from public.import_jobs ij
    where ij.list_id = l.id and ij.kind = 'admin_list'
    order by ij.created_at desc limit 1
  ) j on true
  order by l.updated_at desc;
end;
$$;

revoke all on function public.admin_list_overview() from public, anon;
grant execute on function public.admin_list_overview() to authenticated;

/* ---------- Ảnh bìa danh sách (công khai, Admin tải lên) ---------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('list-covers', 'list-covers', true, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "list-covers: admin tải lên"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'list-covers' and (select private.is_admin()));

create policy "list-covers: admin xóa"
  on storage.objects for delete to authenticated
  using (bucket_id = 'list-covers' and (select private.is_admin()));
