# Hiệu năng, truy cập, chế độ tối (Prompt 8.2b)

Đo ngày 2026-10-27. Lighthouse 13.5, điện thoại giả lập (Moto G Power, 4G chậm, CPU chậm 4 lần), mỗi
trang 5 lượt lấy trung vị (`npm run lighthouse`, CI chạy job "Lighthouse"). Người dùng là khách vừa
xong onboarding (chưa có từ). Lighthouse 13 không còn mục PWA nên "4 mục" là Hiệu năng, Truy cập,
Best Practices, SEO.

## Kết quả

| Trang      | Hiệu năng trước (`main`, máy dev) | Hiệu năng sau (máy dev) | Sau (CI) | Truy cập · Best Practices · SEO |
| ---------- | --------------------------------- | ----------------------- | -------- | ------------------------------- |
| Chào mừng  | 93                                | 93–96                   | 94       | 100 · 100 · 100                 |
| Hôm nay    | 81                                | 85–88                   | 87       | 100 · 100 · 100                 |
| Phiên ôn   | 79                                | 81–87                   | 87       | 100 · 100 · 100                 |
| Thống kê   | 80                                | 85–88                   | 87       | 100 · 100 · 100                 |

Máy dev dao động vài điểm giữa các lần đo nên ghi khoảng; CI ổn định hơn. Nội dung chính (LCP giả
lập) hiện sớm hơn khoảng 0,5–1 giây.

**Mục tiêu ≥ 90 chưa đạt ở 3 trang** (chủ sản phẩm chốt chấp nhận, CI chặn khi dưới 85). Nội dung
chính của app nằm trong IndexedDB (offline-first) nên chỉ vẽ được sau khi tải lõi React/Next + Dexie
và đọc dữ liệu trong máy; phần còn lại trước khi nội dung hiện là lõi đó (~225 KB nén), font Be
Vietnam Pro (8 file, ~74 KB) và HTML (~25 KB, có câu chữ giao diện của next-intl). Đã thử bỏ độ đậm
700 và tắt tải trước font: thay đổi nằm trong mức dao động nên không giữ. Hướng làm tiếp nếu cần:
chỉ gửi câu chữ từng trang cần, thay Dexie bằng thư viện IndexedDB nhỏ hơn, dựng khung trang ở máy
chủ. Lighthouse luôn đo như máy mới mở lần đầu; từ lần mở thứ hai code đã có trong Service Worker.

## Đã làm

- **Code phải tải trước khi vẽ** (ước tính bằng esbuild, đã nén nhỏ, chưa gzip): Hôm nay ~1 MB → 213
  KB, Phiên ôn ~1 MB → 329 KB, Thống kê ~1 MB → 210 KB. Trước đây Zod (~440 KB) và Supabase (~220 KB)
  nằm trên đường mở trang vì màn hình đợi sync engine để biết chủ dữ liệu.
- `src/lib/sync/bridge.ts`: giao diện đọc chủ dữ liệu từ gợi ý trong máy (`ww_owner`), máy không có
  cookie phiên Supabase thì là khách ngay; engine tải sau và là nguồn đúng.
- `DeferredProviders`: đồng bộ, chạy tiếp nhập file, Service Worker + tải trước chỉ tải sau khi trang
  tải xong + 1,5 giây + lúc trình duyệt rảnh.
- Tải khi cần: nội dung từ (`word-data`), audio câu ví dụ (`features/media/sentence-audio.ts`), màn
  xem thẻ từ mới và tập phát âm trong phiên (tải trước ngay khi biết phiên có câu loại đó), ghi chú
  "Của bạn" khi thêm từ có ghi chú.
- Phiên ôn: không chờ mạng lấy đáp án nhiễu khi máy đã đủ từ hoặc phiên trống.
- Offline: phần code tải khi cần được lưu sẵn mỗi lần mở app khi có mạng (tên file đổi theo bản);
  dữ liệu, audio, ảnh không đổi so với Prompt 8.2a. E2E offline (mở Hôm nay/Sổ tay, làm hết phiên ôn
  khi mất mạng) xanh.

## Chuyển câu trong phiên ôn

Đo từ lúc trả lời tới khung hình có câu sau (gồm ghi lượt ôn vào IndexedDB), mốc `ww:next-question`
của Performance API; E2E "học 5 từ khởi đầu" kiểm tra trung vị < 100 ms và in số đo lên trang Actions.
CI (2026-10-27, 15 câu): 29, 32, 30, 31, 30, 12, 13, 13, 12, 13, 17, 10, 13, 12, 15 ms – trung vị 13
ms.

## Truy cập và chế độ tối

- Lighthouse Truy cập 100 ở 4 trang trên và ở Sổ tay, Thêm từ, Cài đặt, Thư viện, Luyện tập, Đăng
  nhập, Kiểm tra micro, Onboarding – cả giao diện sáng và tối.
- Tương phản (WCAG AA ≥ 4,5:1): sáng – chữ phụ 5,2, chữ tím 5,3 (trên nền muted 4,7), chữ trắng trên
  nút 5,3; tối – chữ phụ 7,3, chữ tím 7,3, chữ trên nút 7,0, báo lỗi 6,0.
- Chế độ tối: mặc định theo máy, Cài đặt → Giao diện chọn Theo máy/Sáng/Tối, lưu riêng từng máy
  (cookie `ww_theme`); máy chủ đặt sẵn lớp `dark`, script trong `<head>` áp trước khi vẽ – không nháy
  trắng. Màu thanh trạng thái theo sáng/tối.
- Bàn phím: mọi nhóm lựa chọn (`role="radiogroup"`) dùng mũi tên/Home/End
  (`src/components/ui/radio-keys.ts`); hộp thoại đóng bằng Esc (Radix); flashcard chấm bằng phím 1–4.
