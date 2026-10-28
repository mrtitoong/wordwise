---
name: wordwise-migration
description: Quy trình thay đổi database của WordWise (bảng, cột, ràng buộc, RLS, hàm SQL, pg_cron, private.settings) từ lúc viết migration tới khi áp lên Supabase cloud. Dùng mỗi khi tạo hoặc sửa file trong supabase/migrations, supabase/tests hoặc src/lib/db/database.types.ts.
---

# Thay đổi database WordWise

Đọc kèm skill `supabase-postgres-best-practices` (quy tắc SQL/RLS). Nếu khác với skill này, **làm theo skill này
và CLAUDE.md** (quy ước riêng của dự án).

## 1. Viết migration (viết tay, không `db pull`)
- File mới `supabase/migrations/<YYYYMMDD><HHMMSS>_<tên_snake>.sql`, mã thời gian lớn hơn file cuối cùng
  (xem `ls supabase/migrations | tail -1`). Ngày theo ngày làm việc, giờ tăng dần 010000, 020000…
- Đầu file: 1–3 dòng chú thích tiếng Việt nói migration làm gì và vì sao.
- Chia đoạn bằng `/* ---------- Tên đoạn ---------- */` như các file trước.
- Mọi bảng `public` bật RLS; chính sách có `to authenticated` + điều kiện chủ sở hữu (`(select auth.uid()) = user_id`);
  UPDATE có cả `using` và `with check`. Khóa ngoại kép `(id, user_id)` khi gắn dữ liệu của người dùng.
- Hàm `security definer`: `set search_path = ''`, tên bảng ghi đủ schema, kiểm tra `auth.uid()` trong thân hàm;
  hàm chỉ máy chủ gọi thì `revoke execute … from public, anon, authenticated` và `grant … to service_role`.
  Hàm nội bộ để ở schema `private` (không lộ qua /rpc).
- Giới hạn/ngưỡng đổi được bằng SQL → thêm dòng vào `private.settings` (`on conflict (key) do nothing`), không
  viết cứng trong hàm.
- Đổi ràng buộc `check` liệt kê giá trị (input_method, usage kind…) → `drop constraint` rồi `add constraint`
  với danh sách đầy đủ; tìm mọi bảng dùng cùng danh sách (vd `notebook_entries` và `word_job_requests`).
- Bảng đồng bộ về máy (Dexie): cần `updated_at` do server đặt; xóa là xóa mềm (`deleted_at`).
  Đổi cột của bảng đồng bộ thì sửa cả `src/lib/db/repo.ts`, schema Dexie và `src/lib/sync/`.

## 2. Test pgTAP
- Thêm/sửa `supabase/tests/<mảng>.test.sql` (xem file cùng mảng làm mẫu): thử cả đường được phép và bị chặn
  (người khác, khách, hết lượt). Không chạy được ở máy dev (không có Docker) → CI job "Database" chạy.

## 3. TypeScript types
- `src/lib/db/database.types.ts` phải khớp `supabase gen types typescript --local --schema public` (CI so khớp,
  bỏ qua dòng PostgrestVersion). Máy dev không có Docker → **sửa tay** đúng định dạng CLI: thêm cột vào cả
  `Row`, `Insert`, `Update`; hàm vào `Functions` (Args/Returns), xếp tên theo thứ tự chữ cái như file hiện có.
  Sau đó `npx prettier --write src/lib/db/database.types.ts`.
- CI báo lệch: đọc annotation "types diff" (xem skill `wordwise-ci`) rồi sửa theo diff.

## 4. Seed (chỉ khi đổi từ mẫu)
- Nguồn là JSON trong `src/lib/schema/examples/` → `npm run seed:build` sinh `supabase/seed/words.sql`.
- Đổi bộ dữ liệu thống kê mẫu → `npm run stats:sql`.

## 5. Kiểm tra ở máy rồi đẩy
`npm run typecheck && npm run lint && npm test && npm run format:check`, commit `feat(db): …`, push nhánh, chờ CI
job "Database" xanh.

## 6. Áp lên cloud (project `jhvyyahowopzrpyenwdh`)
- Chỉ áp **sau khi CI job Database xanh**.
- Dùng Supabase MCP `apply_migration` (name = phần tên sau mã thời gian, query = nội dung file). **Không** dùng
  `supabase db push`: mã version trên cloud khác tên file local (phải `migration repair` trước).
- Kiểm tra sau khi áp: `list_migrations`, `get_advisors` (security + performance), thử hàm mới bằng `execute_sql`
  với dữ liệu không ảnh hưởng người dùng.
- Ghi vào CLAUDE.md (mục Quyết định đã chốt) là "Đã áp lên cloud".
