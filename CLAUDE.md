# WordWise – Ứng dụng học từ vựng với SRS

## Sản phẩm
PWA giúp người Việt học từ vựng ngoại ngữ (MVP: tiếng Anh).
- Mỗi người có nhiều sổ tay; thêm từ bằng gõ, giọng nói, chụp ảnh
  (OCR), CSV/Excel/Anki, hoặc từ danh sách có chủ đích do Admin xuất bản.
- Thẻ từ có 5 tab: Nghĩa (nghĩa, IPA, audio, loại từ, ảnh, dạng từ),
  Ví dụ, Cách dùng (collocations, thành ngữ, lỗi hay gặp), Từ liên quan,
  Ghi nhớ (mẹo nhớ, từ dễ nhầm, nguồn gốc). Schema: src/lib/schema/word.ts.
- Luyện tập: flashcard, trắc nghiệm, tập viết (4 cấp gợi ý), tập nghe,
  tập phát âm, theo chủ đề/sổ tay. Lập lịch bằng FSRS.
- Admin tải danh sách từ → hệ thống tự phân tích → Admin duyệt →
  xuất bản vào Thư viện.

Tài liệu:
- docs/plan.md – Kế hoạch sản phẩm (yêu cầu, thuật toán, mô hình dữ liệu).
- docs/prompts.md – Bộ prompt theo giai đoạn GĐ0–GĐ8, prompt trong app,
  prompt tiện ích (Review, Sửa lỗi).

## Cách làm việc
Claude là lập trình viên chính; chủ sản phẩm không viết code.
1. Trước khi code: tóm tắt kế hoạch bằng tiếng Việt dễ hiểu, nêu các lựa
   chọn cần quyết (kèm đề xuất và lý do), rồi dừng chờ duyệt.
2. Sau khi được đồng ý: tự code, viết và chạy test, sửa đến khi xanh. Chỉ
   hỏi khi ảnh hưởng người dùng, chi phí hoặc bảo mật.
3. Khi xong: báo cáo ngắn (đã làm gì, kết quả test, link preview) và tối
   đa 10 việc cần thử tay.
4. Việc cần chủ sản phẩm thao tác (tài khoản, khóa API): hướng dẫn từng
   bước, không yêu cầu dán khóa bí mật vào chat.
Mỗi prompt một nhánh git (vd gd0/ux-flows), gộp vào main khi đạt tiêu chí.
Repo: https://github.com/mrtitoong/wordwise

## Stack
- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui
- Supabase: Postgres, Auth, Storage, Edge Functions, Queues (pgmq),
  RLS bật cho mọi bảng
- Dexie.js (IndexedDB) cho offline-first
- ts-fsrs cho lập lịch; Zod cho validate; next-intl cho i18n
- LLM qua src/lib/llm: Gemini Flash (gói miễn phí) cho nội dung từ chung,
  Claude cho tác vụ chứa dữ liệu người dùng
- Google Cloud Vision (OCR), Web Speech API/Whisper (giọng nói),
  Azure Speech (TTS, chấm phát âm)
- Vitest (unit), Playwright (E2E); triển khai Vercel

## Quy ước
- Giao diện tiếng Việt qua next-intl, không hard-code chuỗi.
- Logic nghiệp vụ (SRS, chấm điểm, so khớp đáp án, chuẩn hóa từ) là hàm
  thuần trong src/lib/, không phụ thuộc React, có unit test.
- Mọi cách nhập từ đi qua cùng hàm normalizeEntry() (từ gốc, trùng,
  ngữ cảnh gốc).
- Mọi lượt ôn ghi IndexedDB trước, đồng bộ sau. review_logs chỉ thêm.
- Khóa API (LLM, OCR, TTS, Speech) chỉ nằm trong Edge Functions.
- Không bao giờ gửi dữ liệu người dùng qua gói LLM miễn phí.
- Vai trò user/admin: mọi route /admin kiểm tra vai trò ở server và RLS.
- Mobile-first: mọi màn hình dùng được ở 360px, nút ≥ 44px.
- Commit nhỏ, theo Conventional Commits.

## Quyết định đã chốt
- 2026-10-20: Đối tượng chính là **người tự học** (người đi làm, tự học,
  ôn thi tự túc). Lớp học cho giáo viên/trung tâm để sau MVP.
- 2026-10-20: Wireframe GĐ0 xem trên điện thoại qua trang Artifact riêng tư
  (claude.ai); màn Phiên ôn gộp 5 chế độ trong một file.
- 2026-10-20: Kiểm tra schema ở GĐ0 bằng package.json tối giản
  (TypeScript, Zod 4, Vitest); GĐ1 mở rộng thành dự án Next.js đầy đủ.
- 2026-10-20: Thẻ từ gọn từ 8 lớp (docs/plan.md §2.1) xuống **5 tab**: Nghĩa ·
  Ví dụ · Cách dùng · Từ liên quan · Ghi nhớ. **Bỏ slang**; bỏ lớp Ngữ pháp
  riêng, chỉ giữ "lỗi hay gặp" (`common_mistakes`, tối đa 3/nghĩa) trong tab
  Cách dùng. Quyết định này thay cho mô tả 8 lớp trong plan.md và docs/prompts.md
  (Prompt 2.1, 2.3, word-content.md cần làm theo 5 tab).
- 2026-10-20: Câu hỏi mở trong docs/ux-flows.md §5 áp dụng theo đề xuất: chuỗi
  ngày có 1 ngày nghỉ/tuần; 5 từ khởi đầu do Admin soạn theo trình độ; gợi ý
  khách tạo tài khoản sau 3 phiên hoặc 20 từ; file > 500 dòng chạy nền.
- 2026-10-20: Mỗi `WordContent` ứng với một bộ (language, lemma, pos). Dữ liệu
  chung cho cả từ (IPA, dạng từ, nguồn gốc, họ từ, mẹo nhớ, từ dễ nhầm) lưu một
  lần; dữ liệu theo nghĩa (ví dụ, đồng/trái nghĩa, collocation, thành ngữ, lỗi
  hay gặp) nằm trong từng nghĩa. Prompt 1.2: đề xuất thêm cột `words.details`
  (JSONB) cho phần chung thay vì lặp trong `word_details` của từng nghĩa.
- 2026-10-20: Phiên bản: Zod 4.6.5, Vitest 5.0.3, TypeScript 6.0.3 (chưa dùng
  TypeScript 7 vì có thể chưa tương thích Next.js 15). Chỉ chọn bản phát hành
  ít nhất 2 tuần.
- 2026-10-20: Vùng chạm ≥ 44px áp dụng cho mọi thứ bấm được, kể cả chip lọc
  và tab (wireframe GĐ0 có chỗ vẽ 36–40px, khi code phải nới vùng chạm).
- Việc để sau (từ Review GĐ0): GĐ2 tự bỏ dấu "/" ở IPA trước khi validate;
  so khớp highlight theo ranh giới từ với tiếng Anh; GĐ5 thêm ký hiệu ngoài
  màu cho âm vị điểm trung bình.
