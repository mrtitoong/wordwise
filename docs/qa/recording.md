# Kiểm thử thu âm (Prompt 5.1)

Thu âm cho tập phát âm dùng MediaRecorder: WebM Opus trên Chrome/Android, MP4/AAC trên Safari iOS;
tối đa 5 giây, tự dừng khi im lặng 1,2 giây sau khi đã nói. Trước khi gửi chấm điểm, bản thu được
đổi sang WAV 16 kHz mono ngay trong trình duyệt.

Trang thử: **Cài đặt → Phiên ôn → Kiểm tra micro** (`/settings/microphone`).

## Tự động (CI)

`e2e/recording.spec.ts` – Chromium với micro giả: màn giải thích trước khi xin quyền, thu và tự
dừng ≤ 5 giây, nghe lại, đổi sang WAV, lần sau không hỏi lại, bấm Dừng thì dừng ngay.

## Thử tay trên thiết bị thật

Mỗi thiết bị, làm lần lượt và ghi kết quả (✅ / ❌ + ghi chú):

1. Mở trang Kiểm tra micro lần đầu → bấm micro → có màn "Cho phép dùng micro" → Cho phép → trình
   duyệt hỏi quyền → Cho phép.
2. Sóng âm nhúc nhích theo giọng nói.
3. Đọc một từ rồi im lặng: tự dừng sau khoảng 1 giây.
4. Không nói gì: tự dừng sau 5 giây, "Có tiếng nói: Không nghe thấy".
5. Bấm nghe lại bản thu: nghe rõ, đúng giọng mình.
6. Bấm "Thử đổi sang WAV": hiện "Được (… KB)".
7. Định dạng hiện ra (ghi lại, vd `audio/mp4`).
8. Từ chối quyền micro (hoặc tắt trong cài đặt trình duyệt) → thử lại: có hướng dẫn bật lại quyền.
9. Thu lại lần hai: không hiện màn giải thích nữa.

| Thiết bị / trình duyệt | 1 | 2 | 3 | 4 | 5 | 6 | 7 (định dạng) | 8 | 9 | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|
| Chrome máy tính (Windows) | | | | | | | | | | |
| Chrome Android | | | | | | | | | | |
| Safari iOS | | | | | | | | | | |
