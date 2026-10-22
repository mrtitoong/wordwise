# Kiểm tra OCR – thêm từ bằng ảnh chụp (Prompt 2.6)

Tiêu chí GĐ2: nhận đúng **≥ 95% từ** trên ảnh sách in rõ.

## Cách đo

- Bộ ảnh mẫu ở `tests/fixtures/ocr/`: mỗi ảnh có file `.txt` cùng tên là chữ đúng.
  - 6 ảnh tổng hợp (`npx tsx scripts/make-ocr-fixtures.ts`): chữ in rõ, nghiêng 7°, mờ, tối,
    ảnh màn hình, biển báo chữ trên nền màu.
  - 4 ảnh chụp thật do chủ sản phẩm chụp (`real-*.jpg`): 2 trang sách, 1 biển hiệu/bao bì,
    1 chữ viết tay.
- `npm run ocr:accuracy` đo trên mọi ảnh:
  - **Chất lượng ảnh** (độ sáng, độ nét) và cảnh báo app sẽ hiện, đo trong Chromium giống app.
  - **Từ đúng** = số từ đọc đúng theo thứ tự (dãy con chung dài nhất) / số từ của chữ đúng,
    không tính hoa thường và dấu câu.
  - Google Cloud Vision (cần `GOOGLE_VISION_API_KEY` trong `.env.local`) và Claude – dự phòng khi
    Vision đọc kém (cần `ANTHROPIC_API_KEY`).

## Kết quả

<!-- results:start -->
Chạy lúc 2026-10-22 01:38 UTC · model dự phòng: claude-sonnet-5-5

| Ảnh | Sáng | Nét | Cảnh báo của app | Vision: từ đúng | Vision: tin cậy · nghiêng | Claude: từ đúng | Claude: thời gian · chi phí |
|---|---|---|---|---|---|---|---|
| print-blurry | 126 | 53 | blurry | — | — | 100.0% (55/55) | 3.7 s · $0.0075 |
| print-clear | 126 | 12615 | — | — | — | 100.0% (55/55) | 2.3 s · $0.0075 |
| print-dark | 60 | 975 | dark | — | — | 100.0% (55/55) | 2.2 s · $0.0075 |
| print-tilted | 120 | 12156 | — | — | — | 100.0% (55/55) | 2.8 s · $0.0080 |
| screen | 238 | 25263 | — | — | — | 100.0% (35/35) | 3.0 s · $0.0055 |
| sign-colored | 96 | 4964 | — | — | — | 100.0% (7/7) | 1.6 s · $0.0044 |

- Sách in rõ (print-clear, real-book-*): Vision —; Claude 100.0% (55/55 từ, 1 ảnh).
- Toàn bộ: Vision —; Claude 100.0% (262/262 từ, 6 ảnh).
- Chưa có GOOGLE_VISION_API_KEY trong .env.local: chưa đo Vision.
<!-- results:end -->

## Nhận xét
