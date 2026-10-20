-- Nhật ký mỗi lần gọi LLM (Prompt 2.0): theo dõi chi phí, lỗi, việc chuyển nhà cung cấp.
-- Chỉ Edge Function (service role) ghi; admin đọc; người dùng thường không thấy.
-- Không lưu nội dung prompt/kết quả để không giữ dữ liệu người dùng ở đây.

create table public.llm_call_logs (
  id uuid primary key default gen_random_uuid(),
  task text not null check (char_length(task) between 1 and 64),
  provider text not null check (provider in ('gemini', 'claude', 'groq')),
  model text not null check (char_length(model) between 1 and 128),
  -- Lần thử thứ mấy với model này (1 = lần đầu).
  attempt integer not null default 1 check (attempt >= 1),
  outcome text not null
    check (outcome in ('ok', 'rate_limited', 'schema_invalid', 'error')),
  is_fallback boolean not null default false,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  error text check (char_length(error) <= 2000),
  created_at timestamptz not null default now()
);

create index llm_call_logs_created_idx on public.llm_call_logs (created_at desc);
create index llm_call_logs_task_idx on public.llm_call_logs (task, created_at desc);

alter table public.llm_call_logs enable row level security;

create policy "llm_call_logs: admin đọc"
  on public.llm_call_logs for select to authenticated
  using ((select private.is_admin()));

revoke all on public.llm_call_logs from anon;
revoke insert, update, delete, truncate on public.llm_call_logs from authenticated;
