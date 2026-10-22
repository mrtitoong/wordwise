# Kiểm tra OCR – thêm từ bằng ảnh chụp (Prompt 2.6)

Tiêu chí GĐ2: nhận đúng **≥ 95% từ** trên ảnh sách in rõ.

## Cách đo

- Bộ ảnh mẫu ở `tests/fixtures/ocr/`: mỗi ảnh có file `.txt` cùng tên là chữ đúng.
  - 6 ảnh tổng hợp (`npx tsx scripts/make-ocr-fixtures.ts`): chữ in rõ, nghiêng 7°, mờ, tối,
    ảnh màn hình, biển báo chữ trên nền màu.
  - 4 ảnh chụp thật do chủ sản phẩm chụp (`real-*.jpg`): 2 trang sách, 1 bìa sách,
    1 chữ viết tay. **Chỉ giữ trên máy** (`.gitignore`): repo công khai, ảnh có nội dung bản quyền
    và chữ viết tay cá nhân.
- `npm run ocr:accuracy` đo trên mọi ảnh:
  - **Chất lượng ảnh** (độ sáng, độ nét) và cảnh báo app sẽ hiện, đo trong Chromium giống app.
  - **Từ đúng** = số từ đọc đúng theo thứ tự (dãy con chung dài nhất) / số từ của chữ đúng,
    không tính hoa thường và dấu câu.
  - Google Cloud Vision (cần `GOOGLE_VISION_API_KEY` trong `.env.local`) và Claude – dự phòng khi
    Vision đọc kém (cần `ANTHROPIC_API_KEY`).

## Kết quả

<!-- results:start -->

Chạy lúc 2026-10-22 02:20 UTC · model dự phòng: claude-sonnet-5-5

| Ảnh              | Sáng | Nét   | Cảnh báo của app | Vision: từ đúng      | Vision: tin cậy · nghiêng | Claude: từ đúng  | Claude: thời gian · chi phí |
| ---------------- | ---- | ----- | ---------------- | -------------------- | ------------------------- | ---------------- | --------------------------- |
| print-blurry     | 126  | 53    | blurry           | lỗi: Vision HTTP 403 | —                         | 100.0% (55/55)   | 3.0 s · $0.0075             |
| print-clear      | 126  | 12615 | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (55/55)   | 2.2 s · $0.0075             |
| print-dark       | 60   | 975   | dark             | lỗi: Vision HTTP 403 | —                         | 100.0% (55/55)   | 2.3 s · $0.0075             |
| print-tilted     | 120  | 12156 | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (55/55)   | 2.2 s · $0.0080             |
| screen           | 238  | 25263 | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (35/35)   | 2.2 s · $0.0055             |
| sign-colored     | 96   | 4964  | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (7/7)     | 2.1 s · $0.0044             |
| real-book-1      | 151  | 11547 | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (86/86)   | 3.7 s · $0.0107             |
| real-book-2      | 153  | 11129 | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (233/233) | 4.0 s · $0.0132             |
| real-handwriting | 164  | 3401  | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (60/60)   | 4.8 s · $0.0112             |
| real-sign        | 139  | 2217  | —                | lỗi: Vision HTTP 403 | —                         | 100.0% (11/11)   | 2.4 s · $0.0094             |

- Sách in rõ (print-clear, real-book-*): Vision —; Claude 100.0% (374/374 từ, 3 ảnh).
- Toàn bộ: Vision —; Claude 100.0% (652/652 từ, 10 ảnh).

<!-- results:end -->

## Nhận xét

- 2026-10-22 (ảnh tổng hợp, chưa có khóa Vision): Claude Sonnet (dự phòng) đọc đúng 100% từ trên cả
  6 ảnh, ~2–4 giây và ~$0,005–0,008 mỗi ảnh. Ảnh mờ 4px vẫn đọc đúng hết nên cảnh báo "mờ" chỉ là
  lời khuyên (người dùng bấm "Vẫn dùng ảnh này" được).
- Ngưỡng cảnh báo bắt đúng ảnh mờ (độ nét 53, ngưỡng 300) và ảnh tối (độ sáng 60, ngưỡng 70); ảnh
  rõ có độ nét > 4.000 nên ngưỡng còn dư nhiều. Cần chỉnh lại theo ảnh chụp thật.
- 2026-10-22 (thêm 4 ảnh chụp thật bằng điện thoại): Claude đọc đúng 100% từ trên cả 2 trang sách
  (86/86 và 233/233, kể cả từ ngắt dòng "or-phans", "over-head"), bìa sách 11/11, chữ viết tay của
  học sinh 60/60 (thừa vài chữ ở dòng tiếng Việt và chữ bị gạch, nên độ chính xác ~95%). Chi phí
  ~$0,01/ảnh thật, 2,4–4,8 giây.
- Ảnh thật không bị cảnh báo nhầm: độ sáng 139–164, độ nét 2.217–11.547 (ngưỡng 70 và 300).
- **Chưa đo được Vision**: Google trả 403 `BILLING_DISABLED` (project chưa bật thanh toán). Khi
  Vision lỗi, app tự chuyển sang Claude nên vẫn dùng được, nhưng mất khung chạm trên ảnh và tốn
  ~$0,01/ảnh thay vì ~$0,0015. Bật thanh toán xong chạy lại `npm run ocr:accuracy`.
