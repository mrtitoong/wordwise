# Thử tiếng Trung trên iPhone (Z3, Z4)

## Lần thử 2026-11-05

Một người thử, Safari iPhone (Safari 26), bản chính, khoảng 14 phút (18:29–18:43 giờ VN). Kết quả đọc từ log Supabase và
`review_logs`, **chưa có nhận xét của người thử**. App không gửi lỗi trình duyệt về máy chủ, nên lỗi giao diện không thấy
được từ đây.

| Việc | Kết quả | Căn cứ |
|---|---|---|
| Đăng nhập Google, tạo tài khoản | Đạt | `/auth/v1/callback` 302, có hồ sơ mới |
| Tìm từ tiếng Trung, thêm vào sổ | Đạt | 5 từ vào "Sổ của tôi" tiếng Trung |
| Xem từ mới, trắc nghiệm, nghe → chọn nghĩa | Đạt | 12 lượt, 8/8 câu có chấm đúng; 4 lượt xem từ mới |
| Tải audio | Đạt | MP3 của từ và câu trả 200; nghe → chọn nghĩa đúng 3/3 (chưa chứng minh chắc là có nghe thấy tiếng) |
| Viết chữ bằng Hanzi Writer | Đạt ở mức có nét mờ | 博士 viết xong 2 chữ, có sai nét nhưng trong mức cho phép (Khó); 爱 ra Quên |
| Đồng bộ | Đạt | 14/14 lượt lên máy chủ sau 1–4 giây, không request lỗi (4xx/5xx) |

Chưa rõ:

- Lượt Quên của 爱: chủ sản phẩm xác nhận một số nét viết hơi lệch nên app từ chối, không phải quên chữ. Mới có 2 lượt Viết
  chữ, đều là ôn ngoài lịch, đều ở mức có nét mờ.

Chưa thử trên iPhone:

- Mất mạng (mọi lượt đồng bộ ngay nên máy luôn có mạng).
- Viết chữ không có nét mờ (mức 3–4).
- Tập phát âm tiếng Trung và đường cao độ (tài khoản này không có lượt chấm nào).
- Cài app vào Màn hình chính.

## Lần thử 2026-11-06

Cùng tài khoản và iPhone, 08:51–08:59 giờ VN. Kết quả đọc từ log, chưa có nhận xét của người thử.

| Việc | Kết quả | Căn cứ |
|---|---|---|
| Tập phát âm tiếng Trung | Máy chủ chấm được | 6/6 lượt `assess-pronunciation` trả 200, 1–2,6 giây; chưa biết mức hiện ra và đường cao độ |
| Viết chữ | 3/4 từ đạt | 爱, 博士 Nhớ; 承诺 Khó; 脸 Quên (chưa rõ lý do) |
| Đồng bộ | Đủ 10/10 lượt | 3 lượt trễ 22–30 giây, các lượt khác 4–7 giây (thường 2–4 giây) |
| Tải trước audio | Không lỗi | 7 câu chưa có file trả 400 (`NoSuchKey`), app bỏ qua như thiết kế |

Lượt trễ khớp với lúc máy mất mạng hoặc app bị ẩn (bộ đồng bộ bỏ qua cả hai), nhưng log không phân biệt được. Lúc
08:55:42 máy vẫn gửi được request. **Cần người thử xác nhận có bật Chế độ máy bay không.**

## Offline trên CI

`e2e/zh-offline.spec.ts` (Chromium): mất mạng, tải lại phiên ôn, viết chữ, có mạng lại, máy chủ nhận lượt ôn. Test
này tìm ra lỗi: người mới mở phiên khi mất mạng phải chờ ~7 giây vì `moreChoices()` thử lại 3 lần (đã sửa). Safari
iPhone vẫn phải thử tay vì Service Worker và IndexedDB của iOS khác Chromium.

## Việc cần thử tay

Cần 5–10 phút, trên iPhone đã đăng nhập, sau khi đã ôn ít nhất một phiên tiếng Trung có mạng:

1. Mở phiên ôn, gặp màn Viết chữ thì bật Chế độ máy bay.
2. Viết xong chữ: nét vẫn nhận, câu sau vẫn hiện.
3. Vuốt tải lại trang khi đang máy bay: phiên ôn vẫn mở được.
4. Tắt Chế độ máy bay, mở lại app: lượt ôn được gửi (biểu tượng đồng bộ hết báo chờ).
5. Viết đúng 3 chữ thật cẩn thận: có nét đúng nào bị báo sai không?
6. Luyện tập → Phát âm: thu được tiếng, hiện mức Rõ/Tạm được/Cần luyện và đường cao độ, thấy dòng "chưa chấm thanh điệu".

| Thiết bị | 1–2 | 3 | 4 | 5 | 6 | Ghi chú |
|---|---|---|---|---|---|---|
| Safari iPhone | | | | | | |
