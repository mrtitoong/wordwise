# Kế hoạch xây dựng ứng dụng học từ vựng

Oct 16, 2026 · @Saksua

## 1. Tổng quan sản phẩm

Ứng dụng (tên tạm: **WordWise**) giúp người học ngoại ngữ ghi nhớ từ mới lâu dài bằng cách kết hợp thẻ từ giàu ngữ cảnh với lịch ôn tập do thuật toán lặp lại ngắt quãng (SRS) quyết định. Mục tiêu MVP: người dùng thêm từ trong dưới 10 giây, ôn 15–20 phút/ngày và giữ được trên 85% số từ đã học sau 30 ngày.

**Người dùng mục tiêu**

- Học sinh, sinh viên ôn thi (IELTS, TOEIC, JLPT, HSK…) cần học nhanh theo danh sách có sẵn.
- Người đi làm học từ phát sinh khi đọc, xem phim, làm việc.
- Người tự học ngôn ngữ thứ ba, muốn một công cụ duy nhất cho nhiều ngôn ngữ.

**Phạm vi**

| Hạng mục | MVP (giai đoạn 0–8) | Sau MVP |
| --- | --- | --- |
| Ngôn ngữ học | Tiếng Anh (giao diện tiếng Việt) | Nhật, Hàn, Trung, Pháp… |
| Nền tảng | Web app (PWA, dùng được trên điện thoại) | App iOS/Android native |
| Sổ tay | Nhiều sổ tay mỗi người, riêng tư | Chia sẻ, sổ tay cộng đồng |
| Nhập từ | Gõ, đọc bằng giọng nói, chụp ảnh (OCR), CSV/Anki | Tiện ích trình duyệt, chia sẻ từ ứng dụng khác |
| Luyện tập | 5 chế độ + SRS | Chế độ hội thoại với AI, thi đấu bạn bè |
| Danh sách có chủ đích | Admin tải lên, hệ thống tự phân tích, duyệt rồi xuất bản | Lớp học: giáo viên giao danh sách cho học viên |
| Đồng bộ | Tài khoản + offline-first | — |

## 2. Yêu cầu chức năng

Mỗi từ là một "thẻ từ" gồm 8 lớp thông tin và nằm trong một hoặc nhiều sổ tay; mỗi lớp có thể nghe (TTS) hoặc từ luyện viết. Phần luyện tập có 6 chế độ, tất cả cùng ghi kết quả vào một lịch sử ôn tập chung.

### 2.1 Thẻ từ

| Lớp | Nội dung | Bắt buộc |
| --- | --- | --- |
| Cơ bản | Nghĩa (tiếng Việt + định nghĩa tiếng Anh), loại từ, phiên âm IPA (Anh–Mỹ và Anh–Anh), audio, hình ảnh gợi nhớ, cấp độ CEFR, tần suất | Có |
| Ví dụ | 2–3 câu ví dụ có bản dịch, từ khóa được tô đậm, có audio; câu gốc người dùng gặp (từ ảnh, bài đọc) được giữ và ưu tiên | Có |
| Quan hệ từ | Đồng nghĩa (kèm sắc thái khác biệt), trái nghĩa, đồng âm khác nghĩa, họ từ (word family) | Nếu có |
| Collocations | Cụm từ hay đi cùng, nhóm theo mẫu (động từ + danh từ, tính từ + danh từ, giới từ…) | Nếu có |
| Thành ngữ & slang | Thành ngữ, cụm động từ, tiếng lóng; gắn nhãn mức trang trọng | Nếu có |
| Ngữ pháp | Cấu trúc đi kèm (vd: *suggest + V-ing*, *suggest that + S + V*), lỗi thường gặp | Nếu có |
| Ghi nhớ & phân biệt (đề xuất thêm) | Mẹo ghi nhớ (liên tưởng âm, gốc từ), từ dễ nhầm và cách phân biệt (*affect/effect*), "bạn giả" (từ trông quen nhưng nghĩa khác) | Nếu có |
| Hình thái & ngữ dụng (đề xuất thêm) | Dạng chia (*go – went – gone*), số nhiều bất quy tắc, biến thể Anh–Mỹ, mức trang trọng, nguyên gốc từ (tiền tố, hậu tố, gốc Latin/Hy Lạp) | Nếu có |

Yêu cầu bổ sung cho thẻ từ:

- Nội dung gốc do hệ thống tạo được giữ nguyên. Người dùng có thể đổi nghĩa hiển thị và ảnh gợi nhớ, và thêm nội dung của riêng mình (câu ví dụ, collocation, ghi chú) vào bất kỳ lớp nào. Nội dung thêm mang nhãn "Của bạn", hiển thị trước nội dung gốc, sửa/xóa được, và được dùng trong luyện tập (vd điền từ vào câu ví dụ của mình). Thấy nội dung gốc sai thì bấm "Báo lỗi" để Admin sửa bản chung.
- Các từ liên quan (đồng nghĩa, họ từ) bấm vào để mở hoặc thêm ngay vào bộ từ.
- Chế độ xem nhanh (chỉ lớp cơ bản) và xem đầy đủ.

### 2.2 Sổ tay và cách thêm từ

Mỗi người tạo nhiều sổ tay (vd "IELTS Writing", "Từ trong phim", "Tiếng Nhật N5"), mỗi sổ có ngôn ngữ, mô tả, ảnh bìa và tag. Một từ có thể nằm trong nhiều sổ tay nhưng chỉ có một lịch ôn, để không ôn trùng.

| Cách thêm | Luồng | Công nghệ |
| --- | --- | --- |
| Gõ | Ô nhập có gợi ý tự động, chọn nghĩa, chọn sổ; dán cả danh sách (mỗi dòng một từ) để thêm hàng loạt | — |
| Đọc (giọng nói) | Bấm giữ micro, nói từ hoặc cụm từ; hiện 3 phương án gần nhất để xác nhận; có thể nói tiếng Việt để tra ngược ("kiên cường" → *resilient*) | Web Speech API, dự phòng Whisper |
| Chụp ảnh | Chụp/chọn ảnh trang sách, biển hiệu, màn hình → OCR → chạm vào từ trên ảnh để chọn, hoặc "Tự chọn từ mới" (lọc từ đã biết, ưu tiên theo trình độ); câu chứa từ được giữ làm câu ví dụ cá nhân | Google Cloud Vision, dự phòng LLM có thị giác |
| File CSV/Excel/Anki | Tải file, ánh xạ cột, xem trước, báo dòng lỗi, bỏ qua từ trùng; xuất ngược lại được | Papa Parse, SheetJS |
| Từ danh sách có chủ đích | Chọn danh sách do Admin xuất bản → thêm toàn bộ hoặc chọn lọc vào sổ tay | Mục 2.5 |

Mọi cách nhập đi qua cùng một bước chuẩn hóa: đưa về từ gốc (*running* → *run*), phát hiện trùng, giữ ngữ cảnh gốc (câu, ảnh, nguồn). Ngữ cảnh cá nhân giúp nhớ tốt hơn câu ví dụ chung. Người dùng đặt giới hạn từ mới mỗi ngày (mặc định 10); từ thêm quá giới hạn nằm chờ trong hàng "Sắp học".

### 2.3 Các chế độ luyện tập

| Chế độ | Cách chơi | Kỹ năng | Cách chấm |
| --- | --- | --- | --- |
| Flashcard | Lật thẻ hai chiều (từ → nghĩa, nghĩa → từ), tự đánh giá 4 mức | Nhận biết | Người dùng tự chấm: Quên / Khó / Được / Dễ |
| Trắc nghiệm | Chọn nghĩa đúng trong 4 đáp án; đáp án nhiễu lấy từ cùng chủ đề/loại từ | Nhận biết | Tự động, kèm thời gian phản hồi |
| Tập viết | 4 cấp gợi ý: xếp chữ cái → điền chữ khuyết (`c_ll_c_t_on`) → chữ đầu + độ dài → không gợi ý; điền từ vào câu ví dụ | Nhớ lại, chính tả | So khớp, chấp nhận lỗi gõ 1 ký tự ở mức "Khó" |
| Tập nghe | Nghe audio → gõ lại từ, chọn nghĩa, hoặc nghe câu rồi điền từ còn thiếu; tốc độ 1x/0.75x | Nghe hiểu | Tự động |
| Tập phát âm | Nghe mẫu → thu âm → so sánh, tô màu âm tiết sai; nghe lại bản thu của mình | Nói | Điểm phát âm 0–100 từ dịch vụ nhận dạng giọng nói |
| Theo chủ đề | Chọn chủ đề/bộ từ, hệ thống trộn các chế độ trên | Tổng hợp | Theo từng chế độ |

Ngoài ra có chế độ **Ôn hôm nay** (mặc định): SRS chọn từ đến hạn và tự chọn chế độ phù hợp với mức thuộc của từng từ (mục 3).

### 2.4 Theo dõi tiến bộ

- Lưu mọi lượt trả lời: từ, chế độ, kết quả, thời gian phản hồi, mức gợi ý, điểm phát âm.
- Bảng điều khiển: chuỗi ngày học (streak), số từ theo trạng thái (Mới / Đang học / Đã thuộc / Thành thạo), tỉ lệ nhớ thực tế, dự báo số thẻ ôn 7 ngày tới.
- Biểu đồ nhiệt kiểu GitHub cho số phút học mỗi ngày.
- Điểm mạnh/yếu theo kỹ năng (nghe, viết, nói) và danh sách "từ hay quên" (leech).
- Thông báo nhắc học theo giờ người dùng chọn.

### 2.5 Danh sách từ có chủ đích (Admin)

Admin tải lên danh sách từ có mục đích (vd "IELTS Band 7 – Environment", "TOEIC Part 5", "Từ vựng tuần 3 lớp A"); hệ thống tự phân tích và chuẩn bị đầy đủ nội dung trước khi xuất bản cho người học.

1. **Tải lên**: CSV/Excel, dán văn bản, hoặc một bài đọc/đề thi (PDF, ảnh) để hệ thống tự trích từ.
2. **Khai báo**: tên, ngôn ngữ, trình độ mục tiêu, chủ đề, mục đích, thời hạn gợi ý (vd 30 ngày).
3. **Phân tích tự động** (chạy nền):
   - Chuẩn hóa từ gốc, gộp trùng, nhận ra cụm từ và cụm động từ.
   - Chọn nghĩa đúng theo ngữ cảnh khi có bài đọc; gắn CEFR và tần suất.
   - Tạo nội dung 8 lớp, audio, ảnh cho từ chưa có trong kho (từ đã có dùng lại).
   - Nhóm theo chủ đề con, sắp thứ tự học: tần suất cao trước, từ cùng họ đứng gần nhau, từ dễ nhầm tách xa nhau.
   - Cảnh báo: nghi sai chính tả, từ hiếm, từ nhiều nghĩa, từ vượt trình độ mục tiêu.
4. **Duyệt**: Admin xem bảng kết quả, sửa, chấp nhận; trạng thái Nháp → Đang xử lý → Chờ duyệt → Đã xuất bản.
5. **Xuất bản**: danh sách xuất hiện trong Thư viện; người học thêm vào sổ tay và nhận lộ trình số từ mới/ngày theo thời hạn (mục 3.4).

Phân quyền: vai trò `user` và `admin` (sau MVP thêm `teacher`). Admin xem thống kê từng danh sách: số người học, tỉ lệ thuộc, 10 từ khó nhất; cập nhật danh sách đã xuất bản thì người học được hỏi có nhận từ mới không.

## 3. Thuật toán ôn tập

Đề xuất dùng **FSRS** (Free Spaced Repetition Scheduler) làm lõi lập lịch, kết hợp 4 cơ chế bổ sung: thang chế độ theo mức thuộc, quy đổi kết quả khách quan thành điểm, xử lý từ hay quên và trộn thứ tự ôn. SM-2 (thuật toán của Anki cũ) giữ làm phương án dự phòng vì đơn giản, dễ kiểm thử.

### 3.1 Vì sao chọn FSRS thay vì SM-2

| Tiêu chí | SM-2 | FSRS |
| --- | --- | --- |
| Mô hình | Hệ số dễ (EF) nhân khoảng cách | Mô hình trí nhớ 3 biến: Độ khó (D), Độ bền (S), Khả năng nhớ lại (R) |
| Điều chỉnh | Cố định cho mọi người | Tham số tối ưu theo lịch sử ôn của từng người |
| Mục tiêu | Không đặt được | Đặt tỉ lệ nhớ mong muốn (mặc định 90%) |
| Ôn trễ | Xử lý kém | Tính đúng mức quên thực tế |
| Thư viện | Tự viết (\~30 dòng) | `ts-fsrs` (TypeScript), `py-fsrs` (Python), mã nguồn mở |

Nguyên lý: sau mỗi lần ôn, FSRS cập nhật D và S, rồi chọn ngày ôn kế tiếp là lúc R dự kiến rơi xuống mức mục tiêu. Khi đủ khoảng 1.000 lượt ôn, chạy tối ưu tham số riêng cho người dùng (job chạy nền hàng tuần).

### 3.2 Thang chế độ theo mức thuộc

Một từ đi từ nhận biết đến tự tạo ra; ôn bằng chế độ khó hơn một chút so với mức hiện tại giúp nhớ sâu hơn ("khó khăn có lợi").

| Mức | Điều kiện (độ bền S) | Chế độ ưu tiên |
| --- | --- | --- |
| 0 – Mới | Chưa ôn | Xem thẻ đầy đủ → flashcard |
| 1 – Nhận biết | S < 3 ngày | Trắc nghiệm, nghe chọn nghĩa |
| 2 – Nhớ lại | 3 ≤ S < 14 ngày | Viết có gợi ý, nghe chép |
| 3 – Vận dụng | 14 ≤ S < 60 ngày | Viết không gợi ý, điền vào câu, phát âm |
| 4 – Thành thạo | S ≥ 60 ngày | Collocation, câu ngữ cảnh mới, phát âm |

### 3.3 Quy đổi kết quả thành điểm FSRS

Các chế độ tự chấm không hỏi người dùng, mà quy đổi từ dữ liệu khách quan:

| Kết quả | Điểm |
| --- | --- |
| Sai, hoặc đúng sau khi xem đáp án | Again (Quên) |
| Đúng nhưng dùng gợi ý, sai 1 ký tự, hoặc chậm hơn 2× trung vị của người dùng | Hard (Khó) |
| Đúng, tốc độ bình thường | Good (Được) |
| Đúng, nhanh hơn 0,5× trung vị, chế độ khó hơn mức hiện tại | Easy (Dễ) |
| Phát âm: < 60 / 60–79 / 80–89 / ≥ 90 điểm | Again / Hard / Good / Easy |

Phát âm được theo dõi bằng một lịch FSRS riêng cho kỹ năng nói, để việc phát âm kém không làm tụt lịch ôn nghĩa của từ. Tương tự, có thể tách thành 3 "thẻ con" cho mỗi từ: Nghĩa, Chính tả, Phát âm.

### 3.4 Cơ chế bổ sung

- **Bước học ngắn hạn**: từ mới xuất hiện lại sau 1 phút và 10 phút trong cùng phiên trước khi vào lịch dài hạn.
- **Từ hay quên (leech)**: quên từ 6 lần trở lên → đánh dấu, gợi ý mẹo ghi nhớ do AI tạo, thêm hình ảnh/ghi chú riêng hoặc tách thành cụm từ.
- **Trộn thứ tự (interleaving)**: tránh 2 từ cùng chủ đề/dễ nhầm đứng liền nhau; xen từ mới giữa các từ ôn (tỉ lệ 1:4).
- **Cân tải**: giới hạn số thẻ ôn/ngày; khi quá tải, ưu tiên thẻ có R thấp nhất và dàn đều thẻ sang ngày sau (±5% khoảng cách).
- **Nhập hàng loạt không gây quá tải**: từ thêm từ ảnh, CSV hay danh sách Admin vào hàng "Sắp học" và được mở dần theo giới hạn từ mới/ngày, không dồn vào một ngày.
- **Học theo mục tiêu và thời hạn**: với danh sách có hạn (vd thi sau 60 ngày), số từ mới/ngày = số từ còn lại ÷ (số ngày còn lại − 14), để 14 ngày cuối chỉ ôn; 14 ngày cuối nâng tỉ lệ nhớ mục tiêu lên 0,95.
- **Học ngữ cảnh**: ưu tiên câu gốc cá nhân (từ ảnh, bài đọc) cho câu hỏi điền từ; ở mức 3–4 dùng câu ví dụ mới do AI tạo để tránh học thuộc lòng một câu.

## 4. Kiến trúc & công nghệ đề xuất

Đề xuất một web app PWA viết bằng TypeScript, lưu dữ liệu cục bộ trước (offline-first) rồi đồng bộ lên Supabase; nội dung từ (ví dụ, collocation, thành ngữ) do LLM tạo một lần và lưu lại dùng chung cho mọi người. Claude Code có thể tự xây MVP với stack này; bạn chỉ cần tạo tài khoản dịch vụ và duyệt.

| Lớp | Công nghệ | Lý do |
| --- | --- | --- |
| Giao diện | Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui | Một codebase cho web + mobile (PWA), hệ sinh thái lớn |
| Lưu cục bộ | IndexedDB qua Dexie.js | Ôn tập không cần mạng, phản hồi tức thì |
| Backend & CSDL | Supabase: PostgreSQL, Auth, Storage, Edge Functions, Row Level Security | Miễn phí giai đoạn đầu, có sẵn xác thực và lưu file |
| Hàng đợi xử lý nền | Supabase Queues (pgmq) + Edge Function worker | Phân tích danh sách Admin, nhập file lớn; chạy lại được khi lỗi |
| Lập lịch ôn | `ts-fsrs` | Chạy được cả trên máy khách và máy chủ |
| Tạo nội dung từ | Gemini Flash (gói miễn phí) cho nội dung từ chung; Claude API cho tác vụ chứa dữ liệu người dùng (chọn từ trên ảnh, phân tích bài đọc Admin); gọi qua lớp chuyển đổi nhà cung cấp, đầu ra JSON theo schema | Phần gọi nhiều nhất được miễn phí; dữ liệu người dùng không đi qua gói miễn phí (Google dùng dữ liệu gói miễn phí để cải thiện sản phẩm); đổi model chỉ bằng cấu hình |
| Chuẩn hóa từ | Lemmatizer (wink-nlp hoặc spaCy), danh sách tần suất | Đưa về từ gốc, gộp trùng, lọc từ đã biết |
| Nhận dạng giọng nói (thêm từ) | Web Speech API; dự phòng Whisper qua Edge Function | Miễn phí trên Chrome/Android, Safari hỗ trợ hạn chế |
| OCR ảnh | Google Cloud Vision (trả vị trí từng từ); dự phòng LLM có thị giác | Có tọa độ để người dùng chạm chọn từ trên ảnh |
| Đọc file | Papa Parse (CSV), SheetJS (Excel), pdf.js (PDF cho Admin) | Xử lý ngay trên trình duyệt |
| Audio đọc | Azure Speech hoặc Google Cloud TTS, lưu cache MP3 vào Storage; dự phòng Web Speech API | Giọng tự nhiên, chọn giọng Anh–Mỹ/Anh–Anh |
| Chấm phát âm | Azure Speech Pronunciation Assessment | Trả điểm theo từng âm vị |
| Hình ảnh | Unsplash/Pexels API; tùy chọn ảnh AI | Ảnh gợi nhớ miễn phí bản quyền |
| Triển khai | Vercel (web), Supabase (dữ liệu) | Triển khai tự động từ GitHub |
| Kiểm thử | Vitest, Playwright | Unit test cho SRS, E2E cho luồng ôn |

Nguyên tắc kiến trúc:

- **Nội dung dùng chung, tiến độ riêng**: mỗi từ chỉ tạo nội dung và audio một lần (bảng `words`), người dùng chỉ lưu trạng thái học và phần chỉnh sửa riêng → chi phí AI giảm dần khi kho từ lớn lên.
- **Offline-first**: mọi lượt ôn ghi vào IndexedDB trước, đồng bộ theo lô khi có mạng; lịch sử ôn chỉ thêm, không sửa nên không xung đột.
- **Khóa API chỉ ở máy chủ**: gọi LLM, TTS, chấm phát âm qua Edge Function, có giới hạn số lần gọi mỗi người/ngày.
- **Đa ngôn ngữ từ đầu**: mọi bảng có cột `language`; giao diện dùng i18n (next-intl).

* **AI không phụ thuộc một nhà cung cấp**: mọi lần gọi LLM đi qua một lớp chung, mỗi tác vụ cấu hình nhà cung cấp riêng; tác vụ chứa dữ liệu người dùng bị chặn không cho đi qua gói miễn phí. Đầu GĐ2, Claude chạy thử 50 từ trên Gemini Flash và Claude, bạn xem bảng so sánh rồi chốt model cho từng tác vụ.

## 5. Mô hình dữ liệu

Dữ liệu chia ba nhóm: nội dung từ dùng chung (ít thay đổi), dữ liệu học của từng người (thay đổi liên tục) và nội dung Admin. 13 bảng chính:

| Bảng | Các trường chính | Ghi chú |
| --- | --- | --- |
| `profiles` | user\_id, display\_name, role (user / admin / teacher) | Phân quyền |
| `words` | id, language, lemma, pos, ipa\_us, ipa\_uk, audio\_us\_url, audio\_uk\_url, cefr, frequency\_rank, forms (JSONB) | Mỗi cặp (từ, loại từ) một dòng |
| `word_senses` | id, word\_id, definition\_en, meaning\_vi, image\_url, order | Một từ nhiều nghĩa |
| `word_details` | sense\_id, examples, synonyms, antonyms, homonyms, collocations, idioms, slang, grammar\_patterns, word\_family, mnemonics, confusables, etymology, register, generated\_by, reviewed | Nội dung mở rộng, JSONB theo schema cố định |
| `notebooks` | id, owner\_id, name, language, description, cover\_url, tags, source\_list\_id | Sổ tay; nhiều sổ mỗi người |
| `user_words` | id, user\_id, sense\_id, custom\_meaning, custom\_note, custom\_image\_url, user\_additions (JSONB: câu ví dụ, collocation, ghi chú theo từng lớp), status (queued / learning / suspended), added\_at | Từ trong kho cá nhân, một dòng cho mỗi nghĩa |
| `notebook_entries` | notebook\_id, user\_word\_id, input\_method (typed / voice / photo / csv / list), context\_sentence, context\_image\_url, source, added\_at | Liên kết từ với sổ tay, giữ ngữ cảnh gốc |
| `cards` | id, user\_word\_id, skill (meaning / spelling / speaking), due, stability, difficulty, reps, lapses, state, last\_review | Trạng thái FSRS cho từng kỹ năng |
| `review_logs` | id, card\_id, user\_id, mode, rating, hint\_level, response\_ms, correct, pronunciation\_score, is\_extra, reviewed\_at, elapsed\_days, scheduled\_days | Chỉ thêm; dùng để thống kê và tối ưu FSRS |
| `curated_lists` | id, created\_by, title, language, target\_cefr, topic, purpose, suggested\_days, status (draft / processing / review / published), version | Danh sách có chủ đích của Admin |
| `curated_list_items` | list\_id, sense\_id, order, subtopic, warnings, admin\_note, context\_sentence | Từ trong danh sách, đã sắp thứ tự học |
| `import_jobs` | id, user\_id, kind (csv / photo / admin\_list), status, total, done, errors (JSONB), created\_at | Theo dõi tiến độ xử lý nền |
| `user_settings` | user\_id, target\_language, daily\_new\_limit, daily\_review\_limit, desired\_retention, fsrs\_params, reminder\_time, accent | Cài đặt cá nhân |

Thiết kế JSONB cho `word_details` cho phép thêm ngôn ngữ mới (vd: kanji, thanh điệu tiếng Trung) mà không đổi cấu trúc bảng. Bảng `review_logs` đánh index theo (user\_id, reviewed\_at) để vẽ biểu đồ nhanh.

## 6. Nguồn dữ liệu từ vựng, audio, hình ảnh

Kết hợp dữ liệu từ điển mở (để đảm bảo đúng) với LLM (để đủ phong phú), sau đó kiểm tra chéo. Kiểm tra giấy phép từng nguồn trước khi dùng thương mại.

| Dữ liệu | Nguồn chính | Dự phòng |
| --- | --- | --- |
| Nghĩa, IPA, loại từ | Wiktionary (bản trích xuất Wiktextract), Free Dictionary API | LLM |
| Đồng/trái nghĩa | WordNet, Datamuse API | LLM |
| Collocation, thành ngữ, slang, ngữ pháp | LLM với prompt có schema | Người dùng báo lỗi/sửa |
| Cấp độ & tần suất | Danh sách CEFR, SUBTLEX, Oxford 3000/5000 (kiểm tra bản quyền) | LLM ước lượng |
| Audio | TTS đám mây, lưu cache | Web Speech API |
| Hình ảnh | Unsplash/Pexels tìm theo từ khóa do LLM gợi ý | Ảnh AI, hoặc người dùng tải lên |

Quy trình đảm bảo chất lượng nội dung AI:

1. LLM trả JSON theo schema cố định; máy chủ kiểm tra bằng Zod, sai schema thì gọi lại tối đa 2 lần.
2. Đối chiếu IPA và loại từ với Wiktionary; lệch thì ưu tiên từ điển.
3. Đánh dấu `reviewed = false`; nút "Báo lỗi" trên mỗi lớp thông tin.
4. Tạo trước nội dung cho \~3.000 từ thông dụng nhất và kiểm tra mẫu 5% bằng tay trước khi ra mắt.

Ảnh chụp của người dùng, file CSV và danh sách Admin đều đi qua cùng pipeline này; từ đã có trong kho không gọi lại AI. Ảnh chụp chỉ lưu khi người dùng chọn giữ làm ngữ cảnh, để bảo vệ quyền riêng tư.

## 7. Lộ trình các giai đoạn

MVP chia 9 giai đoạn, khoảng 28 ngày làm việc để xây dựng cộng 10 ngày dùng thử, tổng cộng khoảng 8 tuần. Claude (qua Claude Code) viết toàn bộ code và test; bạn đọc, kiểm tra và chốt khoảng 1–2 giờ mỗi ngày. Tốc độ vì vậy phụ thuộc vào thời gian duyệt của bạn, không phải tốc độ viết code.

| Việc | Claude làm | Bạn làm |
| --- | --- | --- |
| Thiết kế | Viết user story, luồng, wireframe, schema | Đọc, góp ý, chốt |
| Xây dựng | Lập kế hoạch từng prompt, viết code, viết và chạy test, sửa lỗi | Duyệt kế hoạch trước khi Claude code |
| Kiểm tra | Báo cáo đã làm gì, kết quả test, danh sách cần bạn thử tay | Mở bản preview trên điện thoại, thử theo danh sách, báo lỗi |
| Tài khoản và khóa API | Hướng dẫn từng bước | Tạo tài khoản GitHub, Supabase, Vercel, Google Cloud, Google AI Studio (Gemini), Azure, Anthropic; nhập thẻ thanh toán; dán khóa API vào biến môi trường |
| Nội dung | Tạo trước 3.000 từ, đánh dấu mục nghi ngờ | Kiểm tra mẫu 150 từ |
| Dùng thử | Chuẩn bị onboarding, form góp ý, tổng hợp phản hồi | Mời 10–20 người học thật, theo dõi họ dùng |
| Pháp lý, chi phí | Soạn chính sách quyền riêng tư, ước tính chi phí | Duyệt và chịu trách nhiệm cuối cùng |

&#91;embedded content: lộ trình MVP · 9 giai đoạn, 38 ngày làm việc\]

GĐ3 là mốc quan trọng nhất: sau khoảng ngày 15 (tuần thứ 3) đã có vòng học hoàn chỉnh (ghi vào sổ tay → ôn → lập lịch) để tự dùng hằng ngày.

| Giai đoạn | Sản phẩm bàn giao | Tiêu chí hoàn thành |
| --- | --- | --- |
| GĐ0 · Thiết kế (3 ngày) | Wireframe các màn hình chính (kể cả Sổ tay, Thêm từ, Admin), schema JSON nội dung từ, quyết định stack | Duyệt luồng thêm từ, luồng ôn và luồng Admin trên wireframe |
| GĐ1 · Nền tảng (3 ngày) | Dự án Next.js, Supabase (schema + RLS + vai trò), đăng nhập, Dexie, đồng bộ cơ bản, CI/CD | Đăng nhập được, dữ liệu ghi offline và đồng bộ lại |
| GĐ2 · Sổ tay và thẻ từ (6 ngày) | Pipeline nội dung 8 lớp, TTS, ảnh; màn hình thẻ từ; sổ tay; thêm từ bằng gõ, giọng nói, ảnh (OCR), CSV/Anki; 3.000 từ tạo sẵn | Thêm từ < 10 giây (đã có cache); OCR nhận đúng ≥ 95% từ trên ảnh sách in rõ |
| GĐ3 · SRS (3 ngày) | `ts-fsrs`, thẻ theo kỹ năng, quy đổi điểm, phiên "Ôn hôm nay", flashcard, trắc nghiệm | Unit test lập lịch xanh; mô phỏng 365 ngày ổn định |
| GĐ4 · Viết, nghe, chủ đề (3 ngày) | Viết 4 cấp gợi ý, điền từ vào câu, nghe chép/chọn nghĩa, luyện theo chủ đề và theo sổ tay, thang chế độ | Mọi chế độ ghi `review_logs` đúng định dạng |
| GĐ5 · Phát âm (3 ngày) | Thu âm, gọi dịch vụ chấm điểm, tô màu âm vị, lịch phát âm riêng | Chạy trên Chrome, Safari iOS, Android |
| GĐ6 · Thống kê (3 ngày) | Bảng điều khiển, streak, heatmap, dự báo tải, leech, nhắc học, tối ưu tham số FSRS | Số liệu khớp với truy vấn SQL đối chứng |
| GĐ7 · Admin và danh sách (4 ngày) | Trang quản trị, tải danh sách, hàng đợi phân tích tự động, màn hình duyệt, Thư viện, học theo thời hạn, thống kê danh sách | Danh sách 500 từ xử lý xong < 15 phút, ≤ 2% từ cần Admin sửa |
| GĐ8 · Beta (10 ngày, chủ yếu là người thật dùng thử) | E2E test, tối ưu hiệu năng, PWA, onboarding, theo dõi lỗi, thử với 10–20 người | Lighthouse ≥ 90, không còn lỗi nghiêm trọng |

Sau MVP: các ý tưởng mở rộng ở mục 9, tùy theo những gì chúng ta chốt.

## 8. Chỉ số, kiểm thử và rủi ro

### 8.1 Chỉ số thành công (sau beta 8 tuần)

| Chỉ số | Mục tiêu |
| --- | --- |
| Tỉ lệ nhớ thực tế (đúng ở lượt ôn đến hạn) | 85–92% |
| Người dùng quay lại ngày 7 / ngày 30 | ≥ 40% / ≥ 20% |
| Thời gian học trung bình mỗi ngày | ≥ 12 phút |
| Thời gian thêm một từ mới (đã có trong kho) | < 10 giây |
| Tỉ lệ nội dung AI bị báo lỗi | < 2% |
| Chi phí AI + TTS mỗi người dùng hoạt động/tháng | < 0,20 USD |

### 8.2 Kiểm thử

- Unit test cho lập lịch: quy đổi điểm, thang chế độ, leech, cân tải; mô phỏng 365 ngày ôn với người dùng giả lập để kiểm tra tải hằng ngày không bùng nổ.
- Test so khớp đáp án viết: hoa/thường, dấu cách, lỗi 1 ký tự, biến thể Anh–Mỹ/Anh–Anh (colour/color).
- E2E (Playwright): đăng ký → thêm từ → ôn → mất mạng → ôn tiếp → có mạng → đồng bộ đúng.
- Thử với 10–20 người học thật trong 2 tuần trước beta công khai.

### 8.3 Rủi ro

| Rủi ro | Ảnh hưởng | Cách giảm |
| --- | --- | --- |
| LLM tạo nội dung sai (nghĩa, collocation không tự nhiên) | Người học nhớ sai | Đối chiếu từ điển, nút báo lỗi, kiểm tra mẫu bằng tay |
| Chi phí API tăng theo số người dùng (LLM, OCR, TTS, chấm phát âm) | Lỗ vốn | Cache nội dung dùng chung, giới hạn lượt gọi/ngày, Gemini gói miễn phí cho nội dung từ chung; nếu Google siết giới hạn miễn phí thì tự thử lại và chuyển sang nhà cung cấp dự phòng bằng cấu hình; khi ứng dụng thu phí, kiểm tra lại điều khoản thương mại của gói miễn phí |
| OCR sai với chữ viết tay, ảnh mờ, nghiêng | Người dùng thêm nhầm từ | Luôn cho xem và sửa trước khi lưu; cảnh báo ảnh chất lượng thấp |
| Nhận dạng giọng nói sai từ ngắn, Safari hỗ trợ hạn chế | Thêm từ bằng giọng nói bực bội | Hiện 3 phương án để chọn, dự phòng Whisper |
| Danh sách Admin chất lượng thấp hoặc sai ngữ cảnh | Nhiều người học cùng bị ảnh hưởng | Bắt buộc bước duyệt, cảnh báo tự động, có phiên bản để hoàn tác |
| Chấm phát âm kém chính xác với giọng Việt | Người dùng mất tin tưởng | Hiển thị điểm dạng tham khảo, cho nghe lại để tự so sánh, lịch phát âm tách riêng |
| Bản quyền danh sách từ, hình ảnh, bài đọc Admin tải lên | Rủi ro pháp lý | Chỉ dùng nguồn mở/có giấy phép, ghi nguồn, không công khai toàn văn bài đọc |
| Tải ôn dồn khi người dùng bỏ vài ngày hoặc nhập hàng loạt | Bỏ học hẳn | Hàng "Sắp học", chế độ "quay lại nhẹ nhàng", ưu tiên theo R |
| Xung đột đồng bộ nhiều thiết bị | Mất tiến độ | Log chỉ thêm, tính lại trạng thái thẻ từ log khi xung đột |

## 9. Ý tưởng mở rộng và việc cần chốt

Mình đề xuất đưa ngay **Kiểm tra trình độ đầu vào** vào MVP (công sức thấp, giúp danh sách Admin bỏ qua từ đã biết), và chọn 2–3 ý tưởng ưu tiên 1 cho giai đoạn ngay sau beta.

| Ý tưởng | Mô tả | Giá trị | Công sức | Đề xuất |
| --- | --- | --- | --- | --- |
| Kiểm tra trình độ đầu vào | Bài 5 phút ước lượng vốn từ, tự đánh dấu từ đã biết trong danh sách | Cao | Thấp | Đưa vào MVP (GĐ7) |
| Bài đọc AI từ vốn từ của mình | Mỗi tuần AI viết đoạn văn 150–300 từ, 90–95% từ đã biết + từ đang học, kèm audio | Cao | Trung bình | Ưu tiên 1 |
| Chế độ rảnh tay (podcast) | Nghe liên tục từ + nghĩa + ví dụ khi đi xe, chạy bộ; chạy nền, khóa màn hình vẫn nghe | Trung bình | Thấp | Ưu tiên 1 |
| Lớp học cho giáo viên | Giáo viên tạo lớp, giao danh sách có hạn, xem tiến bộ từng học viên; mở hướng bán cho trung tâm | Cao | Trung bình | Ưu tiên 1 nếu nhắm trung tâm |
| Hội thoại với AI | Trò chuyện (gõ hoặc nói) theo tình huống, AI cố ý dùng từ đang học và sửa lỗi | Cao | Cao | Ưu tiên 2 |
| Thêm từ từ mọi nơi | Tiện ích trình duyệt (bôi đen để lưu kèm câu gốc), nút chia sẻ từ ứng dụng khác, phụ đề YouTube | Trung bình | Trung bình | Ưu tiên 2 |
| Trò chơi hóa nhẹ | XP, huy hiệu, mục tiêu tuần, bảng xếp hạng bạn bè | Trung bình | Thấp | Ưu tiên 2 |
| Bot ôn qua Zalo/Telegram | Nhắc và ôn nhanh 5 câu ngay trong ứng dụng chat | Trung bình | Trung bình | Ưu tiên 3 |
| Thư viện sổ tay cộng đồng | Chia sẻ, sao chép sổ tay của người khác, bình chọn | Trung bình | Trung bình | Ưu tiên 3 |
| Widget màn hình khóa | "Từ của ngày" và ôn 1 câu ngay trên widget | Trung bình | Cao (cần app native) | Khi làm app native |

Câu hỏi cần chốt cùng nhau:

- [ ] Đối tượng chính: người tự học hay trung tâm/giáo viên? (quyết định có làm Lớp học sớm không)
- [ ] Ai được làm Admin: chỉ đội ngũ nội dung, hay mở cho giáo viên?
- [ ] Ngôn ngữ đầu tiên: chỉ tiếng Anh, hay thêm ngôn ngữ nào ngay?
- [ ] Mô hình thu phí: miễn phí, freemium (giới hạn OCR/phát âm/AI), hay bán gói cho trung tâm?
- [ ] Nền tảng: PWA trước như đề xuất, hay cần app native ngay từ đầu?
- [ ] Chọn 2–3 ý tưởng từ bảng trên cho giai đoạn sau beta.
