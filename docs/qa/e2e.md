# Bộ E2E (Prompt 8.1)

Playwright, thư mục `e2e/`. Chạy cục bộ: `npm run build && npm run test:e2e` (cần Supabase cục bộ +
Mailpit; máy không có Docker thì các test cần Supabase tự bỏ qua). Trong CI (`ci.yml`, job `e2e`)
mọi test chạy với Supabase cục bộ và bản build có cửa test (`NEXT_PUBLIC_E2E=1`).

## Kích thước màn hình (dự án Playwright)

| Dự án | Màn hình | Chạy gì |
|---|---|---|
| `mobile-360` | 360 × 740, cảm ứng | Test theo tính năng (`e2e/*.spec.ts`) và kiểm tra nhanh (`e2e/smoke`) |
| `iphone-13` | 390 × 664, cảm ứng, user agent iPhone | 7 luồng đầy đủ (`e2e/journeys`) |
| `desktop` | 1280 × 720, chuột + bàn phím | 7 luồng đầy đủ (`e2e/journeys`) |

`iphone-13` chạy bằng **Chromium** (không phải WebKit): micro giả và Web Speech chỉ có ở Chromium.
Safari thật thử tay theo `docs/qa/recording.md`.

## 7 luồng đầy đủ (`e2e/journeys`)

| # | File | Luồng | Giả lập |
|---|---|---|---|
| 1 | `01-guest-to-account` | Khách gõ 3 từ → tạo tài khoản (mã 6 số) → 3 từ còn trên máy, trên máy chủ, máy khác đăng nhập thấy đủ | – |
| 2 | `02-library-all-modes` | Đăng nhập → onboarding → Thư viện "IELTS – Environment" → học 5 từ mới → bật Luyện phát âm → phiên 10 thẻ đủ flashcard, trắc nghiệm, nghe → chọn nghĩa, tập viết, phát âm | Micro giả, chấm phát âm; danh sách xuất bản sẵn bằng quyền service; ép dạng câu hỏi |
| 3 | `03-offline-session` | Ôn 3 câu → mất mạng → ôn hết phiên → có mạng lại → máy chủ có đúng các lượt ôn (theo id) và lịch ôn khớp | – |
| 4 | `04-csv-import` | Premium nhập CSV 50 dòng (17 từ trong kho, 30 từ mới, 3 dòng lỗi ở dòng 6, 20, 40) → "Chỉ hiện dòng lỗi" đúng 3 dòng và lý do → nhập 47 từ | `generate-word` (tra kho thật, tạo từ mới trả "đang chuẩn bị") |
| 5 | `05-stats-after-session` | Học 5 từ khởi đầu, sai 1 câu trắc nghiệm → Thống kê: chuỗi 1 ngày, tỉ lệ nhớ "cần thêm dữ liệu", phút học, độ chính xác từng kỹ năng tính lại từ lượt ôn trong máy, ô hôm nay trên heatmap, "Từ hay quên" | – |
| 6 | `06-photo-to-notebook` | Premium tạo sổ "Bài đọc" → ảnh mẫu → tự chọn từ → sửa chính tả → 3 từ vào đúng sổ kèm câu gốc, 1 từ mới xếp việc vào sổ đó, đồng bộ lên máy chủ | `ocr-image`, `generate-word` |
| 7 | `07-admin-to-learner` | Admin tạo danh sách → dán 3 từ → Phân tích → (worker xong) → Chờ duyệt → duyệt → xuất bản → khách ở trình duyệt khác thấy trong Thư viện, thêm vào sổ mới | Worker `analyze-list` (ghi kết quả phân tích rồi gọi `finish_list_analysis` như worker) |

Vì sao giả lập: CI không chạy Edge Function gọi dịch vụ ngoài (AI, Google Vision, Azure) và không có
khóa. Phần đó có unit test riêng (`src/lib/**`) và job CI `functions`.

## Kiểm tra nhanh trên bản preview Vercel (`e2e/smoke`, `preview-e2e.yml`)

Mỗi khi Vercel build xong một nhánh (commit status "Vercel" thành công – Vercel không tạo GitHub
Deployment cho repo này nên nghe sự kiện `status`), GitHub Actions chạy `e2e/smoke` trên bản preview
theo nhánh `https://wordwise-git-<nhánh>-mrtitoong.vercel.app`: khách → onboarding → học từ đầu tiên → sổ tay, thẻ từ 5 tab,
Thống kê, Thư viện. Bản preview nối với **Supabase thật**, nên chỉ dùng chế độ khách: không đăng
nhập, không ghi gì lên máy chủ, không gọi AI. 7 luồng đầy đủ chỉ chạy với Supabase cục bộ.

Bản preview đang mở công khai (đã tắt Deployment Protection) nên không cần khóa. Nếu bật lại bảo vệ:
thêm secret GitHub `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Project → Settings → Deployment
Protection → Protection Bypass for Automation), test tự dùng khóa này.
GitHub chỉ chạy workflow sự kiện `status` từ file trên `main`, nên workflow bắt đầu chạy sau khi gộp
nhánh này vào `main`.

## Cửa test trong app (chỉ bản build `NEXT_PUBLIC_E2E=1`)

- `data-e2e-answer`: đáp án của câu đang hỏi (test không nghe được âm thanh).
- localStorage `ww_e2e_overrides`: ép dạng câu hỏi `meaningMode` (flashcard, mcq, listening) và
  `spellingKind` (writing, listen-type, listen-cloze); giá trị là mảng thì các câu lần lượt nhận từng
  dạng.
- `window.__wordwiseE2E.patchCards(skill, patch, limit)`: cho thẻ đến hạn ngay, đặt mức thuộc;
  `limit` chỉ cho chừng ấy thẻ đến hạn, còn lại dời sang mai.
- `window.__wordwiseE2E.seedHistory(days)`: lịch sử ôn giả cho Thống kê.

## Kết quả

| Ngày | Nhánh | Dự án | Kết quả | Thời gian job e2e |
|---|---|---|---|---|
| 2026-10-26 | gd8/e2e-suite | mobile-360, iphone-13, desktop | 66/66 qua (3,5 phút chạy test) | ~6 phút (trước 8.1: ~4 phút) |

Lỗi thật do bộ luồng phát hiện khi viết:

- Nhập file: màn "Đã nhập xong" báo "0 bỏ qua" dù có dòng lỗi (lúc xem trước báo đúng "3 bỏ qua").
  Đã sửa: đếm cả dòng bị loại lúc xem trước (`ImportRecord.rejected`).
- Hết phiên ôn khi offline, bấm "Xong" → trang lỗi mất mạng của trình duyệt (chưa có Service Worker
  lưu sẵn giao diện). Để Prompt 8.2 (mở app offline); luồng 3 hiện đợi có mạng rồi mới bấm "Xong".
