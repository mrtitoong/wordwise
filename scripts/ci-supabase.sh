#!/usr/bin/env bash
# CI: khởi động Supabase cục bộ chạy nền để việc tải ảnh Docker (~1 GB) diễn ra song song với
# npm ci, rồi chờ nó sẵn sàng trước các bước cần database.
#   bash scripts/ci-supabase.sh start -x studio,imgproxy,...   (tham số chuyển cho supabase start)
#   bash scripts/ci-supabase.sh wait
set -euo pipefail

LOG=/tmp/supabase-start.log
PID=/tmp/supabase-start.pid

case "${1:-}" in
  start)
    shift
    nohup supabase start "$@" > "$LOG" 2>&1 &
    echo $! > "$PID"
    ;;
  wait)
    pid=$(cat "$PID")
    while kill -0 "$pid" 2>/dev/null; do sleep 2; done
    cat "$LOG"
    # Tiến trình chạy nền không trả mã lỗi qua các bước: kiểm tra lại bằng status.
    supabase status > /dev/null
    ;;
  *)
    echo "Dùng: $0 start [tham số supabase start] | wait" >&2
    exit 2
    ;;
esac
