-- Tập phát âm: lưu điểm cao nhất của các lần đọc lại và số lần chấm trong một câu (trước đây chỉ lưu
-- điểm lần đầu nên không biết người học đã đọc lại được hay chưa). Chỉ thêm cột, cột cũ giữ nguyên.

/* ---------- review_logs ---------- */
alter table public.review_logs
  add column pronunciation_best real
    check (pronunciation_best between 0 and 100),
  add column pronunciation_attempts smallint
    check (pronunciation_attempts between 1 and 100);
