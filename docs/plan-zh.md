# Kế hoạch thêm tiếng Trung

Trạng thái: **đã duyệt (2026-11-04), cả 8 đề xuất ở mục 3.** Cơ sở: thí nghiệm ở `docs/zh-spike.md`.

## 1. Mục tiêu

Người Việt học từ vựng tiếng Trung giản thể theo cùng cách đã học tiếng Anh: sổ tay, thẻ từ 5 tab, ôn theo lịch
FSRS, Thư viện. Bản đầu nhắm **từ vựng HSK 3.0 cấp 1–3** (2.245 từ, 900 chữ). Điểm khác so với tiếng Anh:

- Thẻ từ có pinyin, thanh điệu và âm Hán Việt (lợi thế riêng cho người Việt).
- Tập viết là viết chữ Hán đúng thứ tự nét, thay cho gõ chính tả.
- Luyện phát âm có đường cao độ để người học tự so thanh điệu.

Không làm ở bản đầu: phồn thể làm chữ chính, chấm thanh điệu tự động, HSK 4 trở lên, đọc câu dài, thêm từ bằng
ảnh/giọng nói/link.

## 2. Quy ước (chủ sản phẩm đặt)

- Mọi thứ sau cờ `feature_zh`; không được làm thay đổi hành vi tiếng Anh đang beta. Migration chỉ thêm, không sửa
  cột cũ.
- Chữ chính giản thể; pinyin lấy theo từ (CC-CEDICT) trước, thư viện sau.
- Logic theo ngôn ngữ nằm trong `src/lib/lang/{en,zh}`; không if/else ngôn ngữ rải rác trong component.
- Ghi nguồn dữ liệu (CC-CEDICT, Unihan, Make Me A Hanzi) ở trang Giới thiệu.

Đoạn này đã chép vào `CLAUDE.md`. Công việc nằm trên nhánh `feature/zh`.

## 3. Các điểm đã chốt

| # | Câu hỏi | Đề xuất | Lý do |
|---|---|---|---|
| 1 | Chấm thanh điệu thế nào? | **Không chấm.** Vẽ đường cao độ của người học cạnh đường mẫu. Tập phát âm tiếng Trung **không tính vào lịch ôn** ở bản đầu; Azure chỉ chấm phụ âm và vần, có ghi rõ "chưa chấm thanh điệu". | Azure gần như không bắt sai thanh (1/20). Tự đo cao độ báo nhầm ~30% bản đọc đúng, đưa vào lịch sẽ chấm sai người học. |
| 2 | Âm Hán Việt lấy từ đâu? | **LLM gợi ý, đối chiếu Unihan, chỗ lệch Admin duyệt.** Làm một lần cho 900 chữ, dùng âm Hán Việt của từng chữ. | Unihan thiếu 123 chữ và ~28% số âm đối chiếu không chuẩn, nên ước tính **~340 chữ cần người xem**. Cần người biết Hán Việt duyệt. |
| 3 | Dùng CC-CEDICT đến đâu? | **Chỉ lấy pinyin và dạng giản/phồn thể**, lưu riêng có ghi nguồn. Không đưa định nghĩa vào prompt; nghĩa tiếng Việt do LLM viết. | Tránh việc nội dung thẻ từ bị coi là bản phỏng theo và phải mở theo CC BY-SA. Đây là cách giảm rủi ro, không phải ý kiến pháp lý. |
| 4 | Danh sách HSK dùng thế nào? | Dùng làm nhãn cấp và danh sách trong Thư viện, tên mô tả kiểu "Từ vựng theo cấp HSK 3.0", không gợi ý được chứng nhận. **Hỏi luật sư trước khi mở công khai.** | Quyền tác giả của danh sách chưa rõ, tên HSK có thể là nhãn hiệu (chưa xác minh). |
| 5 | Một người học hai ngôn ngữ thì sao? | **Chọn ngôn ngữ đang học**, đổi ở màn Hôm nay. Hôm nay, phiên ôn, Luyện tập, Thống kê chỉ hiện ngôn ngữ đó. Chuỗi ngày dùng chung; số từ mới và giới hạn ôn mỗi ngày tính riêng từng ngôn ngữ. | Không trộn thẻ Anh–Trung trong một phiên, người học khỏi bị rối. Sổ tay đã có cột `language`, `user_settings.target_language` đã có sẵn. |
| 6 | Tập viết chữ Hán ra sao? | Dùng lại thẻ Chính tả (đổi tên hiển thị thành "Viết chữ"), viết từng chữ của từ bằng Hanzi Writer, độ dễ 1. **Mức 0–2 có nét mờ**; mức 3–4 ẩn nét mờ sau khi thử trên người thật. Có công tắc tắt trong Cài đặt. | Trên máy thật có nét mờ nhận 63/63 nét đúng; chưa có số liệu khi ẩn nét mờ. Viết tay tốn thời gian hơn gõ nên cần cho tắt. |
| 7 | Cách thêm từ ở bản đầu? | **Gõ (chữ Hán hoặc pinyin), Thư viện, File.** Ảnh, Nói, Link làm sau. | Ba cách này đủ cho người học theo HSK; các cách còn lại cần thêm tách từ, nhận dạng và kiểm thử riêng. |
| 8 | Ai dùng được khi đang làm? | Cờ theo tài khoản, bật bằng SQL như Premium. Khi mở rộng, gói Free/Premium và giới hạn giống tiếng Anh. | Không ảnh hưởng người đang beta, không thêm quy tắc gói mới. |

## 4. Các giai đoạn

Mỗi giai đoạn một nhánh con từ `feature/zh`, xong thì gộp vào `feature/zh`; gộp `main` khi cờ vẫn tắt và test tiếng
Anh vẫn xanh.

| GĐ | Làm gì | Đạt khi |
|---|---|---|
| **Z0 Nền ngôn ngữ** | Tạo `src/lib/lang/{en,zh}`, chuyển các chỗ đang ghi cứng tiếng Anh vào đó (tìm nhanh ra ~21 dòng, có thể còn nữa); thêm cờ `feature_zh`; lọc theo ngôn ngữ đang học. | Toàn bộ unit và E2E tiếng Anh xanh, không đổi hành vi khi cờ tắt. |
| **Z1 Nội dung** | Nạp pinyin từ CC-CEDICT; prompt `word-content` cho tiếng Trung; **so sánh model trên 50 từ** như đã làm với tiếng Anh; audio giọng zh-CN; âm Hán Việt. | Chủ sản phẩm xem mẫu và chốt model; 900 chữ có âm Hán Việt đã duyệt. |
| **Z2 Thẻ từ, thêm từ** | Thẻ từ hiện pinyin có thanh, Hán Việt, cấp HSK; tìm bằng chữ Hán, pinyin, tiếng Việt; `normalizeEntry()` cho tiếng Trung; đổi ngôn ngữ đang học. | Thêm được từ bằng Gõ và File, thẻ dùng được ở 360px. |
| **Z3 Ôn tập** | Flashcard, trắc nghiệm, nghe → chọn nghĩa; Viết chữ bằng Hanzi Writer, dữ liệu nét tải theo chữ và lưu cho offline. | Phiên ôn tiếng Trung chạy trọn vẹn, cả khi offline; **đã thử trên Safari iPhone**. |
| **Z4 Phát âm** | Azure zh-CN chấm phụ âm và vần; đường cao độ học viên cạnh mẫu trên trang tập phát âm. | Thử với người thật, nhãn "chưa chấm thanh điệu" hiện rõ. |
| **Z5 Thư viện, ra mắt** | Tạo trước 2.245 từ; danh sách HSK 1–3 qua luồng Admin; trang Giới thiệu ghi nguồn và kèm văn bản giấy phép. | Mọi việc trong bảng tuân thủ của `docs/zh-spike.md` §4 xong; đã có ý kiến về HSK (điểm 4). |

Thứ tự này để phần có rủi ro với tiếng Anh (Z0) làm trước và xong sớm, các phần sau chỉ thêm code tiếng Trung.

## 5. Thay đổi kỹ thuật chính

Đã có sẵn: `LanguageSchema` và cột `language` nhận `zh`; `ChineseExtraSchema` (simplified, traditional, pinyin, tones,
hsk); `word_details` dạng JSONB. Prompt `word-content` đã nhận tham số ngôn ngữ nhưng nội dung còn viết cho tiếng Anh.

Cần thêm hoặc đổi:

- **Âm Hán Việt:** bảng riêng theo chữ, thêm mới, không đổi cột cũ.
- **Nguồn CC-CEDICT:** bảng riêng để biết phần dữ liệu nào chịu CC BY-SA.
- **Audio:** đường dẫn đang theo `us|uk`, cần thêm giọng zh-CN.
- **Chuẩn hóa từ:** tiếng Trung không có từ gốc; đổi phồn thể sang giản thể, nhận pinyin có dấu, pinyin số.
- **Chấm đáp án, bàn phím:** bàn phím chữ cái của app không dùng cho tiếng Trung.
- **Dữ liệu nét:** tự phục vụ kèm `ARPHICPL.TXT`; không dùng `dictionary.txt` của Make Me A Hanzi (LGPL-3).

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| **Một chữ, cùng loại từ, nhiều âm** (vd động từ 看 kàn/kān, 倒 dǎo/dào). `words` chỉ phân biệt theo chữ + loại từ, còn pinyin nằm ở cấp từ. | Đầu Z1 đếm trường hợp trong HSK 1–3. Nếu đáng kể thì thêm pinyin theo từng nghĩa. |
| Làm Z0 gây lỗi tiếng Anh đang beta. | Đổi cấu trúc, không đổi hành vi; toàn bộ test hiện có là hàng rào; cờ tắt mặc định. |
| Chất lượng nội dung LLM với tiếng Trung chưa được đo (số liệu Haiku là của tiếng Anh). | So sánh 50 từ ở Z1 trước khi tạo hàng loạt; cần người biết tiếng Trung xem mẫu. |
| Pinyin của từ ngoài CC-CEDICT, biến điệu (一, 不), thanh nhẹ. | Thẻ từ hiện pinyin từ điển; không có thì dùng thư viện và đánh dấu để duyệt. |
| Trang Giới thiệu chưa có (Prompt 8.3 đang hoãn). | Làm phần ghi nguồn ở Z5, trước khi mở cho người ngoài. |
| Hanzi Writer mới thử với một người trên Android và 2 lượt trên Safari iPhone (`docs/qa/zh-iphone.md`), đều có nét mờ. | Thử iPhone khi mất mạng, thử người mới học và chế độ ẩn nét mờ trước khi bật mức 3–4. |

## 7. Chi phí ước tính

- **Tạo 2.245 từ:** khoảng **$8,5** nếu giá giống tiếng Anh (Haiku ~$3,8/1.000 từ); con số thật đo ở Z1.
- **Âm Hán Việt:** không đáng kể (900 chữ, một lần).
- **Audio, chấm phát âm:** cùng cách tính với tiếng Anh, chưa đo riêng cho zh-CN.
- **Dữ liệu nét:** ~818 KB gzip cho 900 chữ, không phát sinh dịch vụ mới.
