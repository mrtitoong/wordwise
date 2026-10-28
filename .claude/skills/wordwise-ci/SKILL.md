---
name: wordwise-ci
description: Theo dõi và đọc lỗi CI (GitHub Actions) và preview Vercel của WordWise sau khi push – lint, typecheck, unit test, build, Lighthouse, E2E Playwright, Database (pgTAP, types), Edge Function. Dùng sau mỗi lần push nhánh, trước khi gộp main, hoặc khi CI đỏ.
---

# CI WordWise

Repo công khai `mrtitoong/wordwise`. **Không có `gh`** trên máy dev và GitHub MCP có thể không kết nối được, nên đọc
trạng thái qua trang web công khai, không cần đăng nhập.

## Các job (`.github/workflows/ci.yml`, chạy cho mọi nhánh)
| Job | Kiểm tra | Hay đỏ vì |
|---|---|---|
| Lint, typecheck, test, build | eslint, prettier, tsc, vitest, `stats:perf`, `functions:build --check`, `sw:build --check`, next build | quên `npm run functions:build`/`sw:build` sau khi sửa code dùng chung, quên prettier |
| Lighthouse | 4 trang (Chào mừng, Hôm nay, Phiên ôn, Thống kê), trung vị 5 lượt, chặn khi < 85 | thêm thư viện nặng vào trang chính (dùng `next/dynamic`) |
| E2E | Playwright `mobile-360`, `iphone-13`, `desktop` + Supabase cục bộ, Mailpit | đổi chữ/nhãn giao diện mà test tìm theo chữ, thiếu `waitForTestHooks(page)` |
| Database | `supabase db lint`, pgTAP, `database.types.ts` khớp schema, seed/stats SQL khớp | types sửa tay lệch định dạng CLI (skill `wordwise-migration`) |
| Edge Function | chạy hàm trên Supabase cục bộ, `scripts/smoke-generate-word.ts` | bundle cũ, thư viện npm thiếu trong dependencies |

`preview-e2e.yml`: kiểm tra nhanh chế độ khách trên preview Vercel, chỉ chạy cho `main`.

## Xem trạng thái (trang HTML công khai, không bị giới hạn 60 lượt/giờ)
```bash
# Lượt chạy mới nhất của một nhánh (aria-label: "completed successfully" / "failed" / "currently running" / "cancelled")
curl -s "https://github.com/mrtitoong/wordwise/actions?query=branch%3A<nhánh>" \
  | grep -oE 'aria-label="(completed successfully|failed|currently running|queued|cancelled)[^"]*"' | head -5
# Mã lượt chạy CI mới nhất của nhánh
curl -s "https://github.com/mrtitoong/wordwise/actions/workflows/ci.yml?query=branch%3A<nhánh>" \
  | grep -oE '/mrtitoong/wordwise/actions/runs/[0-9]+' | head -1
```
- Lượt "cancelled" thường do lượt mới hơn của cùng nhánh thay thế (vd push main ngay sau khi gộp), không phải lỗi.
- CI mất khoảng 10–15 phút. Chờ bằng một lần kiểm tra sau ~10 phút, không hỏi liên tục.

## Đọc lỗi
- **Annotation** (lỗi pgTAP, diff types, lỗi test) hiện trên trang lượt chạy:
  `curl -s https://github.com/mrtitoong/wordwise/actions/runs/<id>` rồi tìm theo tên job hoặc "Error". Log đầy đủ
  của job cần đăng nhập, nên CI cố ý in lỗi quan trọng ra annotation.
- **API GitHub** (`api.github.com/repos/mrtitoong/wordwise/commits/<sha>/check-runs`, `/check-runs/<id>/annotations`)
  cho dữ liệu gọn hơn, nhưng không đăng nhập chỉ được **60 lượt/giờ cho mỗi IP** và hay hết. Chỉ dùng khi trang
  HTML không đủ. Gặp "rate limit exceeded" thì quay về HTML, không thử lại liên tục.
- Đọc được lỗi rồi thì tái hiện ở máy (`npx vitest run <file>`, `npx playwright test <file> --project=mobile-360`).
  Test cần Supabase cục bộ không chạy được ở máy dev (không Docker), phải sửa theo annotation rồi push lại.

## Preview Vercel
- Link: `https://wordwise-git-<nhánh, "/" thành "-">-mrtitoong.vercel.app`, công khai.
- Vercel MCP không có quyền vào scope `mrtitoong` (403). Trạng thái build xem bằng commit status "Vercel" trên trang
  commit `https://github.com/mrtitoong/wordwise/commit/<sha>`, hoặc mở thẳng link preview.

## Trước khi gộp main
Mọi job của lượt chạy cuối trên nhánh phải xanh (hoặc nói rõ với chủ sản phẩm job nào đỏ và vì sao). Sau khi gộp,
kiểm tra lượt CI của `main` một lần.
