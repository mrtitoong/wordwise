---
name: wordwise-edge-function
description: Quy trình viết, đóng gói, kiểm tra và deploy Edge Function của WordWise (generate-word, word-media, ocr-image, fetch-article, transcribe, assess-pronunciation, send-reminders, analyze-list, admin-word hoặc hàm mới). Dùng khi sửa src/functions/**, src/lib/** mà Edge Function import, hoặc supabase/functions/*/index.js.
---

# Edge Function WordWise

## Cấu trúc
- Mã nguồn `src/functions/<tên>/`:
  - `handler.ts`: logic HTTP, nhận dependency qua tham số (`createXHandler(deps)`), không gọi `Deno` trực tiếp.
  - `handler.test.ts`: Vitest với dependency giả.
  - `main.ts`: điểm vào Deno, `declare const Deno` chỉ phần cần dùng, tạo Supabase client bằng service role,
    gọi `Deno.serve(createXHandler({...}))`.
- Logic thuần đặt ở `src/lib/<mảng>/` (có unit test), không phụ thuộc Deno.
- **Không bao giờ sửa tay** `supabase/functions/<tên>/index.js`: file sinh bởi `npm run functions:build`
  (esbuild; thư viện npm thành `npm:tên@phiên-bản` theo package.json, nên phiên bản phải cố định).

## Hàm mới
1. Thêm tên vào mảng `FUNCTIONS` trong `scripts/build-functions.ts`.
2. Thêm khối vào `supabase/config.toml` (chú thích tiếng Việt: hàm làm gì, mã nguồn ở đâu):
   ```toml
   [functions.<tên>]
   enabled = true
   verify_jwt = false
   entrypoint = "./functions/<tên>/index.js"
   ```
   `verify_jwt = false` vì hàm **tự kiểm tra đăng nhập**: lấy Bearer token → `supabase.auth.getUser(token)`;
   không có người dùng thì trả `{ status: "login_required" }` (khách). Hàm do pg_cron gọi thì kiểm tra khóa trong
   Vault (vd `word_worker_secret`).

## Quy tắc bảo mật/chi phí
- Khóa API (LLM, Azure, Vision, Pexels…) chỉ đọc bằng `Deno.env.get` (Supabase Secrets). Không log khóa, không log
  nội dung người dùng (ảnh, âm thanh, bài viết).
- Thêm khóa mới: hướng dẫn chủ sản phẩm tự đặt (`npx supabase secrets set TÊN=… --project-ref jhvyyahowopzrpyenwdh`
  hoặc Dashboard → Edge Functions → Secrets), **không** yêu cầu dán khóa vào chat.
- Tác vụ tốn tiền: trừ lượt trước khi gọi dịch vụ ngoài (`consume_usage` + kind trong `usage_events`, giới hạn trong
  `private.settings`), xem skill `wordwise-migration` để thêm kind.
- Gọi LLM qua `src/lib/llm` với tác vụ cấu hình ở `src/config/llm.ts`; tác vụ chứa dữ liệu người dùng không dùng
  model miễn phí.
- Tải URL do người dùng đưa: qua `fetchPage` (`src/lib/article/fetch-page.ts`: kiểm tra URL + tra DNS chặn IP nội bộ).

## Kiểm tra trước khi deploy
```bash
npm run functions:build
npx vitest run src/functions/<tên> src/lib/<mảng>
npm run typecheck && npm run lint && npm run format:check
```
Commit cả mã nguồn và `supabase/functions/<tên>/index.js` (CI chạy `functions:build -- --check`). CI job "Edge
Function" chạy thử trên Supabase cục bộ.

## Deploy (máy dev đã `supabase login`, không cần Docker)
```bash
npx supabase functions deploy <tên> --project-ref jhvyyahowopzrpyenwdh --use-api
```
- Deploy khi migration mà hàm cần **đã áp lên cloud** (thứ tự: migration trước, hàm sau).
- Hàm dùng chung code đã sửa (vd `src/lib/words/pipeline.ts`) → build lại và deploy mọi hàm có `index.js` thay đổi
  (`git status supabase/functions`).
- Thử nhanh sau deploy: gọi không đăng nhập phải nhận `login_required` (hàm khởi động được):
  `curl -s -X POST https://jhvyyahowopzrpyenwdh.supabase.co/functions/v1/<tên> -H "content-type: application/json" -d '{}'`
- Lỗi khi chạy thật: Supabase MCP `query_logs` (nhật ký Edge Function). Phần cần đăng nhập thật thì đưa vào danh
  sách "việc cần thử tay" cho chủ sản phẩm.
- Ghi vào CLAUDE.md là "đã deploy <tên>".
