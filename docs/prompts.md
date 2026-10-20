# Bộ prompt xây dựng ứng dụng học từ vựng

Oct 16, 2026 · @Saksua

## Cách dùng bộ prompt

Bộ prompt này dùng với một trợ lý lập trình AI (Claude Code, Cursor…) để làm lần lượt 9 giai đoạn (GĐ0–GĐ8) trong tài liệu Kế hoạch. Mỗi giai đoạn có 2–4 prompt, chạy theo thứ tự; chỉ sang prompt tiếp theo khi tiêu chí hoàn thành của prompt trước đạt.

Quy tắc chung:

1. Tạo file `CLAUDE.md` (hoặc `AGENTS.md`, `.cursorrules`) ở gốc dự án với nội dung bên dưới; trợ lý AI đọc file này ở mọi phiên.
2. Đặt tài liệu Kế hoạch vào `docs/plan.md` để AI tham chiếu.
3. Mỗi prompt là một phiên/nhánh git riêng; yêu cầu AI lập kế hoạch trước, duyệt rồi mới viết code.
4. Phần trong `[ngoặc vuông]` là chỗ cần điền.
5. Sau mỗi giai đoạn: chạy prompt Review (cuối tài liệu), cập nhật `CLAUDE.md` với quyết định mới.

### Quy trình: Claude làm, bạn duyệt

Claude Code viết toàn bộ code và test; bạn chỉ đọc, phân tích và chốt ở 3 điểm dừng của mỗi prompt. Thời lượng ghi ở từng giai đoạn là số ngày làm việc, giả định bạn dành 1–2 giờ mỗi ngày để duyệt.

1. **Duyệt kế hoạch**: Claude đọc prompt, trình bày sẽ làm gì và các lựa chọn cần bạn quyết; bạn đồng ý hoặc sửa.
2. **Duyệt kết quả**: Claude code, chạy test, triển khai bản preview, rồi báo cáo ngắn kèm danh sách việc cần bạn thử tay.
3. **Chốt**: bạn thử trên điện thoại, báo lỗi nếu có; khi đạt tiêu chí hoàn thành, Claude ghi quyết định vào `CLAUDE.md` và gộp code.

Việc chỉ bạn làm được: tạo tài khoản (GitHub, Supabase, Vercel, Google Cloud, Google AI Studio (Gemini), Azure, Anthropic), nhập thông tin thanh toán, dán khóa API vào biến môi trường, thử trên điện thoại thật, mời người dùng thử. Claude sẽ hướng dẫn từng bước khi cần.

Dán đoạn này ở đầu mỗi phiên làm việc:

```text
Bạn là lập trình viên chính của dự án; tôi là chủ sản phẩm, không viết code.
Đọc CLAUDE.md và docs/plan.md. Hôm nay làm: [Prompt x.y].
Cách làm việc:
1. Trước khi code: tóm tắt kế hoạch bằng tiếng Việt dễ hiểu, nêu các lựa
   chọn cần tôi quyết (kèm đề xuất của bạn và lý do), rồi dừng chờ tôi.
2. Sau khi tôi đồng ý: tự code, tự viết và chạy test, tự sửa đến khi
   test xanh. Không hỏi tôi về chi tiết kỹ thuật trừ khi ảnh hưởng đến
   người dùng, chi phí hoặc bảo mật.
3. Khi xong: báo cáo ngắn (đã làm gì, kết quả test, link preview) và
   danh sách tối đa 10 việc tôi cần thử tay, mỗi việc một dòng.
4. Việc cần tôi thao tác (tạo tài khoản, khóa API): hướng dẫn từng bước
   bằng tiếng Việt, không yêu cầu tôi dán khóa bí mật vào khung chat.
```

### File bối cảnh dự án (CLAUDE.md)

```markdown
# WordWise – Ứng dụng học từ vựng với SRS

## Sản phẩm
PWA giúp người Việt học từ vựng ngoại ngữ (MVP: tiếng Anh).
- Mỗi người có nhiều sổ tay; thêm từ bằng gõ, giọng nói, chụp ảnh
  (OCR), CSV/Excel/Anki, hoặc từ danh sách có chủ đích do Admin xuất bản.
- Thẻ từ có 5 tab: Nghĩa (nghĩa, IPA, audio, loại từ, ảnh, dạng từ),
  Ví dụ, Cách dùng (collocations, thành ngữ, lỗi hay gặp), Từ liên quan,
  Ghi nhớ (mẹo nhớ, từ dễ nhầm, nguồn gốc).
- Luyện tập: flashcard, trắc nghiệm, tập viết (4 cấp gợi ý), tập nghe,
  tập phát âm, theo chủ đề/sổ tay. Lập lịch bằng FSRS.
- Admin tải danh sách từ → hệ thống tự phân tích → Admin duyệt →
  xuất bản vào Thư viện.
Chi tiết: docs/plan.md

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
[cập nhật sau mỗi giai đoạn]
```

## GĐ0 – Thiết kế và chuẩn bị (3 ngày)

Mục tiêu: chốt luồng người dùng, wireframe và schema nội dung từ trước khi viết code.

**Prompt 0.1 – Luồng người dùng và danh sách màn hình**

```text
Bạn là product designer cho ứng dụng học từ vựng mô tả trong docs/plan.md.
Hãy:
1. Viết 5 user story chính cho 4 nhóm người dùng (ôn thi, người đi làm,
   tự học, Admin nội dung) theo mẫu "Là ..., tôi muốn ..., để ...".
2. Vẽ luồng (Mermaid flowchart) cho: onboarding, tạo sổ tay, thêm từ
   (gõ / nói / chụp ảnh / file), thêm từ từ danh sách có chủ đích,
   phiên "Ôn hôm nay", xem thống kê, Admin tải lên → duyệt → xuất bản.
3. Liệt kê các màn hình (tối đa 14), mỗi màn: mục đích, thành phần UI,
   hành động chính, trạng thái rỗng/lỗi/đang tải.
4. Chỉ ra 3 điểm dễ khiến người học bỏ cuộc và cách thiết kế để tránh
   (gợi ý: nhập quá nhiều từ một lúc, tải ôn dồn).
Xuất ra docs/ux-flows.md. Chưa viết code.
```

**Prompt 0.2 – Wireframe**

```text
Dựa trên docs/ux-flows.md, tạo wireframe dạng trang HTML tĩnh (Tailwind CDN,
không JS logic) cho các màn: Trang chủ/Hôm nay, Danh sách sổ tay, Chi
tiết sổ tay, Thẻ từ (8 lớp, dạng tab), Thêm từ (4 tab: Gõ, Nói, Ảnh,
File), Chọn từ trên ảnh (ảnh với các từ được khoanh, chạm để chọn),
Thư viện danh sách có chủ đích, Phiên ôn (flashcard, trắc nghiệm, viết,
nghe, phát âm), Kết quả phiên, Thống kê, Cài đặt, Admin: Tải danh
sách, Admin: Duyệt kết quả phân tích.
Yêu cầu: khung mobile 375px (Admin dùng khung desktop 1280px), tiếng
Việt, dùng từ mẫu "resilient" với dữ liệu giả đầy đủ 8 lớp. Mỗi màn một
file trong design/wireframes/.
```

**Prompt 0.3 – Schema nội dung từ**

```text
Thiết kế Zod schema (TypeScript) cho nội dung một từ, dùng chung cho
LLM output, database (JSONB) và UI. Bao gồm: lemma, language, pos, ipa
(us/uk), cefr, forms (dạng chia, số nhiều, biến thể Anh–Mỹ), register,
etymology, senses[] (definition_en, meaning_vi, image_query), examples[]
(sentence, translation_vi, highlight), synonyms[] (word, nuance_vi),
antonyms[], homonyms[] (word, meaning_vi), word_family[], collocations[]
(pattern, phrase, example), idioms[] (phrase, meaning_vi, register),
slang[], grammar_patterns[] (pattern, example, common_mistake),
mnemonics[] (type, text_vi), confusables[] (word, difference_vi).
Mọi trường "nếu có" là mảng có thể rỗng. Thiết kế để mở rộng cho
tiếng Nhật/Trung (furigana, pinyin, thanh điệu) qua trường language_extra.
Xuất src/lib/schema/word.ts kèm 2 ví dụ JSON hợp lệ ("run", "resilient").
```

Tiêu chí hoàn thành: có `docs/ux-flows.md`, wireframe mở được trên điện thoại, schema validate được 2 ví dụ.

## GĐ1 – Nền tảng và dữ liệu (3 ngày)

Mục tiêu: dự án chạy được, đăng nhập được, dữ liệu ghi offline và đồng bộ lên Supabase.

**Prompt 1.1 – Khởi tạo dự án**

```text
Đọc CLAUDE.md và docs/plan.md. Khởi tạo dự án Next.js 15 (App Router,
TypeScript strict, src/), cài Tailwind, shadcn/ui, next-intl (vi mặc định,
en), Zod, Dexie, ts-fsrs, Vitest, Playwright, ESLint + Prettier.
Cấu trúc thư mục: src/app, src/components, src/lib/{srs,db,sync,schema,
grading}, src/features/{words,review,stats,settings}, supabase/.
Thiết lập GitHub Actions chạy lint + typecheck + test. Tạo layout mobile
với thanh điều hướng dưới: Hôm nay, Từ của tôi, Luyện tập, Thống kê.
Lập kế hoạch trước, chờ tôi duyệt.
```

**Prompt 1.2 – Database Supabase**

```text
Tạo migration SQL trong supabase/migrations cho 13 bảng ở mục 5 của
docs/plan.md: profiles, words, word_senses, word_details, notebooks,
user_words, notebook_entries, cards, review_logs, curated_lists,
curated_list_items, import_jobs, user_settings.
Yêu cầu:
- UUID khóa chính, created_at/updated_at, foreign key + ON DELETE phù hợp.
- words: unique (language, lemma, pos). cards: unique (user_word_id, skill).
  user_words: unique (user_id, sense_id) – một từ nhiều sổ tay vẫn một lịch ôn.
- profiles.role mặc định 'user'; hàm is_admin() dùng trong policy.
- RLS: nội dung từ ai cũng đọc, chỉ service role ghi; dữ liệu cá nhân
  chỉ chủ sở hữu đọc/ghi; review_logs chỉ INSERT; curated_lists chỉ admin
  ghi, người dùng chỉ đọc danh sách status='published'.
- Index: cards(user_id, due), review_logs(user_id, reviewed_at),
  notebook_entries(notebook_id).
- Seed 20 từ mẫu đủ nội dung 5 tab theo src/lib/schema/word.ts, 1 admin mẫu.
Sinh TypeScript types từ schema. Viết test RLS: user A không đọc được
cards của user B; user thường không ghi được curated_lists.
```

**Prompt 1.3 – Đăng nhập**

```text
Làm đăng nhập bằng Supabase Auth: email magic link và Google OAuth.
Sau lần đăng nhập đầu, chạy onboarding 3 bước: chọn ngôn ngữ học, trình
độ hiện tại (A1–C1) + mục tiêu (IELTS, giao tiếp, công việc…), số từ
mới/ngày và giờ nhắc học → lưu user_settings. Middleware bảo vệ route.
Cho phép dùng thử không cần tài khoản (dữ liệu chỉ ở máy), khi đăng ký
sau thì chuyển dữ liệu lên tài khoản.
```

**Prompt 1.4 – Offline-first và đồng bộ**

```text
Xây lớp dữ liệu offline-first trong src/lib/db và src/lib/sync:
- Dexie DB phản chiếu user_words, cards, review_logs, user_settings và cache
  nội dung từ đã dùng (words, senses, details).
- Mọi ghi đi vào Dexie + hàng đợi outbox; sync engine đẩy theo lô 50 bản
  ghi khi online, kéo thay đổi theo updated_at.
- Xung đột: review_logs chỉ thêm nên hợp nhất theo id; cards lấy
  last_review mới nhất, nếu lệch thì tính lại trạng thái từ review_logs.
- Hook React: useOnlineStatus, useSyncStatus; biểu tượng trạng thái đồng bộ.
Viết unit test cho hợp nhất xung đột và E2E: ghi offline → online → dữ
liệu lên server.
```

Tiêu chí hoàn thành: CI xanh, test RLS và test đồng bộ đạt, triển khai được lên Vercel.

## GĐ2 – Sổ tay, nhập từ và nội dung AI (6 ngày)

Mục tiêu: tạo sổ tay, thêm từ bằng 4 cách (gõ, nói, chụp ảnh, file) và nhận đủ nội dung 5 tab của thẻ từ kèm audio, ảnh.

**Prompt 2.0 – Lớp nhà cung cấp AI và chọn model**

```text
Viết module src/lib/llm (dùng trong Edge Functions):
- Interface LLMProvider { generateJSON(prompt, schema, opts) } với 3
  adapter: Gemini (Google AI Studio), Claude (Anthropic), Groq.
- Cấu hình theo tác vụ trong config/llm.ts, đổi nhà cung cấp chỉ bằng
  cấu hình/biến môi trường:
    word-content, example-generator, mnemonic → Gemini Flash (gói miễn phí)
    photo-word-picker, list-analyzer           → Claude (trả phí)
- Quy tắc cứng: tác vụ có cờ containsUserData=true (câu gốc của người
  dùng, văn bản OCR, bài đọc Admin) KHÔNG được đi qua nhà cung cấp gói miễn
  phí; viết test cho quy tắc này. Khi tạo nội dung từ chung, bỏ
  context_sentence của người dùng ra khỏi prompt.
- Gặp 429/RESOURCE_EXHAUSTED: chờ lũy tiến (1s, 2s, 4s… tối đa 60s),
  quá 5 lần thì chuyển sang nhà cung cấp dự phòng và ghi log.
- Ghi log mỗi lần gọi: tác vụ, nhà cung cấp, model, token, thời gian, lỗi.

Sau đó viết scripts/compare-models.ts: chạy prompt word-content cho 50 từ
mẫu (trải đều A1–C1, có từ nhiều nghĩa, cụm động từ) trên Gemini Flash
và Claude, xuất bảng so sánh HTML đặt hai kết quả cạnh nhau theo từng
lớp, kèm tỉ lệ hợp lệ schema, thời gian và chi phí ước tính. Dừng lại để
tôi xem và chốt model cho từng tác vụ.
```

**Prompt 2.1 – Pipeline tạo nội dung từ**

```text
Tạo Supabase Edge Function `generate-word`:
- Input: { lemma, language, pos? }. Chuẩn hóa lemma (lowercase, trim,
  đưa về dạng gốc: "running" → "run").
- Nếu words đã có → trả ngay từ DB.
- Nếu chưa: lấy IPA/nghĩa từ Free Dictionary API, gọi src/lib/llm với
  tác vụ 'word-content' (model đã chốt ở Prompt 2.0) và prompt tại
  src/prompts/word-content.md, validate bằng Zod schema, lỗi thì gọi lại
  tối đa 2 lần. Không đưa dữ liệu riêng của người dùng vào prompt.
- IPA lệch giữa từ điển và LLM → dùng từ điển.
- Lưu words/word_senses/word_details với generated_by (nhà cung cấp +
  model) và reviewed=false.
- Giới hạn 50 từ mới/người/ngày; khi gói miễn phí bị giới hạn tốc độ, đưa
  từ vào hàng đợi và hiển thị "Đang chuẩn bị nội dung" thay vì báo lỗi.
- Script pregenerate.ts chạy chậm theo giới hạn gói miễn phí (vd 12
  lượt/phút), tiếp tục được qua nhiều ngày.
Khóa API đọc từ secrets. Viết test với LLM giả lập (mock).
```

**Prompt 2.2 – Audio và hình ảnh**

```text
Tạo Edge Function `word-media`:
- Audio: gọi [Azure Speech / Google TTS] tạo MP3 cho từ (giọng en-US và
  en-GB) và cho từng câu ví dụ; lưu Supabase Storage theo đường dẫn
  audio/{language}/{lemma}/{voice}.mp3; có rồi thì không tạo lại.
- Ảnh: tìm trên Unsplash bằng image_query do LLM đề xuất, lưu URL +
  tên tác giả để ghi nguồn; không có kết quả thì để trống.
Phía client: component <AudioButton> phát audio, nếu lỗi thì dùng Web
Speech API; hỗ trợ tốc độ 1x và 0.75x.
```

**Prompt 2.3 – Màn hình thẻ từ**

```text
Làm trang /words/[id] theo wireframe design/wireframes/word-card.html:
- Đầu thẻ: từ, loại từ, IPA US/UK kèm nút nghe, cấp CEFR, ảnh gợi nhớ,
  các sổ tay chứa từ này.
- 5 tab: Nghĩa, Ví dụ, Cách dùng (collocations, thành ngữ, lỗi hay gặp),
  Từ liên quan, Ghi nhớ (mẹo nhớ, từ dễ nhầm, nguồn gốc). Dạng từ nằm ở
  đầu thẻ. Ẩn tab rỗng
  (trừ khi người dùng đã thêm nội dung riêng vào tab đó).
- Câu ví dụ tô đậm từ khóa, có nút nghe và hiện/ẩn bản dịch. Câu gốc
  người dùng gặp (từ ảnh, file) hiển thị đầu tiên kèm ảnh gốc nếu có.
- Từ đồng nghĩa/họ từ/từ dễ nhầm là chip bấm được: mở thẻ hoặc "+ Thêm
  vào sổ".
- Nội dung gốc chỉ đọc. Người dùng được:
  + đổi nghĩa hiển thị và ảnh gợi nhớ (custom_meaning, custom_image_url),
    có nút "Dùng lại bản gốc";
  + thêm câu ví dụ, collocation, ghi chú của riêng mình vào từng lớp
    qua nút "+ Thêm của bạn", lưu vào user_words.user_additions (JSONB
    theo lớp, validate bằng Zod), sửa/xóa được, hiển thị trước nội dung
    gốc với nhãn "Của bạn";
  + câu ví dụ tự thêm có nút tạo audio (TTS) và được ưu tiên trong câu
    hỏi điền từ ở phần luyện tập.
- Nút "Báo lỗi" trên mỗi lớp gốc (gửi cho Admin, không sửa bản chung).
- Skeleton khi đang tạo nội dung; hiển thị từng lớp khi có.
```

**Prompt 2.4 – Sổ tay, thêm từ bằng gõ và file**

```text
Làm:
1. Sổ tay: danh sách sổ (tên, số từ, số từ đến hạn, ảnh bìa), tạo/sửa/
   xóa/lưu trữ; trang chi tiết sổ lọc theo trạng thái học, tag, cách nhập;
   chuyển/sao chép từ giữa các sổ. Xóa từ khỏi sổ không xóa lịch ôn nếu
   từ còn trong sổ khác.
2. Hàm src/lib/entry/normalizeEntry(): đưa về từ gốc, phát hiện trùng
   (cùng nghĩa đã có trong kho), giữ ngữ cảnh gốc; mọi cách nhập dùng chung.
3. Màn Thêm từ, tab Gõ: gợi ý tự động từ bảng words; Enter để thêm,
   chọn nghĩa nếu từ có nhiều nghĩa, chọn sổ; dán nhiều dòng để thêm
   hàng loạt.
4. Tab File: CSV, Excel (.xlsx), Anki (.apkg); ánh xạ cột (word, meaning,
   example, note, tags), xem trước, báo dòng lỗi, bỏ qua trùng; file lớn
   chạy qua import_jobs với thanh tiến độ. Xuất sổ tay ra CSV/Anki.
5. Từ nhập hàng loạt vào trạng thái queued (hàng "Sắp học"), mở dần theo
   daily_new_limit.
6. Script scripts/pregenerate.ts tạo trước nội dung cho 3.000 từ thông
   dụng, chạy song song 5 luồng, tiếp tục được nếu bị ngắt.
```

**Prompt 2.5 – Thêm từ bằng giọng nói**

```text
Làm tab Nói trong màn Thêm từ:
- Nút micro bấm giữ; dùng Web Speech API (lang theo ngôn ngữ của sổ),
  lấy tối đa 3 phương án (maxAlternatives) để người dùng chọn.
- Trình duyệt không hỗ trợ (Firefox, một số bản Safari): thu âm bằng
  MediaRecorder, gửi Edge Function `transcribe` (Whisper), trả 3 phương án.
- Chế độ tra ngược: nói tiếng Việt ("kiên cường") → gợi ý 3–5 từ tiếng
  Anh tương ứng kèm sắc thái (resilient, tenacious…) để chọn.
- Chế độ liên tục: nói nhiều từ liên tiếp, mỗi từ thành một dòng chờ
  xác nhận.
- Sau khi chọn → normalizeEntry() → lưu với input_method='voice'.
Xử lý từ chối quyền micro, ồn, không nhận ra; test thủ công trên Chrome
Android và Safari iOS.
```

**Prompt 2.6 – Thêm từ bằng chụp ảnh (OCR)**

```text
Làm tab Ảnh trong màn Thêm từ:
1. Chụp bằng camera hoặc chọn ảnh; nén về cạnh dài 2000px, cho xoay/cắt.
2. Edge Function `ocr-image`: gọi Google Cloud Vision (DOCUMENT_TEXT_
   DETECTION), trả danh sách từ kèm tọa độ bounding box và câu chứa nó;
   độ tin cậy thấp → thử lại bằng LLM có thị giác. Không lưu ảnh trên
   server trừ khi người dùng chọn giữ làm ngữ cảnh.
3. Màn Chọn từ: hiển thị ảnh, vẽ khung lên từng từ; chạm để chọn/bỏ
   chọn, kéo để chọn cụm từ. Nút "Tự chọn từ mới": bỏ từ đã có trong kho,
   từ quá cơ bản so với trình độ, tên riêng, số; đánh dấu sẵn phần còn lại.
4. Danh sách đã chọn cho sửa chính tả trước khi lưu; mỗi từ giữ câu
   gốc làm context_sentence, input_method='photo'.
5. Cảnh báo ảnh mờ/tối/nghiêng; giới hạn 30 ảnh/người/ngày.
Test với 10 ảnh mẫu trong tests/fixtures/ocr (sách in, màn hình, biển
hiệu, chữ viết tay), ghi tỉ lệ nhận đúng vào docs/qa/ocr.md.
```

Tiêu chí hoàn thành: thêm từ đã có trong kho dưới 10 giây bằng cả 4 cách; OCR nhận đúng ≥ 95% từ trên ảnh sách in rõ; kiểm tra tay 150 từ ngẫu nhiên (5%) không có lỗi nghiêm trọng.

## GĐ3 – SRS, flashcard, trắc nghiệm (3 ngày)

Mục tiêu: vòng học hoàn chỉnh – từ đã thêm được lên lịch, ôn trong phiên "Ôn hôm nay" và cập nhật lịch đúng.

**Prompt 3.1 – Lõi lập lịch**

```text
Viết module thuần src/lib/srs (không phụ thuộc React/DB) bọc ts-fsrs:
- createCards(userWord): tạo 3 thẻ theo skill: meaning, spelling, speaking
  (speaking chỉ mở khi meaning đạt mức 2).
- review(card, rating, now, params) → { card mới, log }.
- gradeFromOutcome({ mode, correct, usedHint, hintLevel, typoCount,
  responseMs, userMedianMs, pronunciationScore, cardLevel }) → Rating,
  theo bảng quy đổi ở mục 3.3 docs/plan.md.
- masteryLevel(card) → 0..4 theo độ bền S (mục 3.2).
- pickMode(card, availableModes) → chế độ phù hợp mức thuộc, thỉnh
  thoảng (20%) chọn chế độ khó hơn một bậc.
- isLeech(card): lapses ≥ 6.
Cấu hình: desired_retention mặc định 0.9, bước học 1m và 10m,
maximum_interval 365 ngày, bật fuzz.
Unit test đầy đủ cho từng hàm + test mô phỏng: 1 người học 10 từ/ngày
với xác suất nhớ theo mô hình FSRS trong 365 ngày; in ra tải ôn hằng
ngày, kiểm tra tải trung bình ổn định (không tăng tuyến tính).
```

**Prompt 3.2 – Xếp hàng phiên ôn**

```text
Viết src/lib/srs/queue.ts: buildSession(cards, settings, now) trả danh
sách câu hỏi cho phiên:
- Lấy thẻ đến hạn, sắp theo khả năng nhớ R tăng dần; giới hạn
  daily_review_limit; thêm từ mới đến daily_new_limit.
- Xen từ mới giữa từ ôn tỉ lệ 1:4; không để 2 từ cùng chủ đề hoặc
  cùng gốc từ (resilient/resilience) đứng liền nhau.
- Thẻ chấm Again quay lại sau 3–5 câu trong cùng phiên.
- Người dùng bỏ học > 3 ngày: chế độ "quay lại nhẹ nhàng", tối đa
  50 thẻ/ngày, phần còn lại giãn ra các ngày sau.
Unit test cho từng quy tắc.
```

**Prompt 3.3 – Giao diện phiên ôn, flashcard, trắc nghiệm**

```text
Làm trang /review và /review/session:
- Trang Hôm nay: số thẻ đến hạn, số từ mới, thời gian ước tính, nút Bắt đầu.
- Kiến trúc: mỗi chế độ là một component cùng interface
  { card, content, onAnswer(outcome) }, để GĐ4–5 cắm thêm chế độ.
- Flashcard: mặt trước từ + audio tự phát (hoặc nghĩa, chiều ngược),
  lật bằng chạm/Space; 4 nút Quên/Khó/Được/Dễ hiện khoảng cách kế
  tiếp (vd "4 ngày"); phím tắt 1–4; vuốt trái/phải trên mobile.
- Trắc nghiệm: 4 đáp án, đáp án nhiễu cùng loại từ và chủ đề, đo
  thời gian phản hồi; sai thì hiện đáp án đúng + câu ví dụ.
- Mỗi câu trả lời: gradeFromOutcome → review → ghi Dexie (card +
  review_log) ngay lập tức.
- Màn kết thúc phiên: số câu, tỉ lệ đúng, từ sai nhiều, streak.
E2E: thêm 5 từ → ôn hết → due cập nhật đúng.
```

Tiêu chí hoàn thành: tự dùng app ôn hằng ngày được; test mô phỏng 365 ngày đạt.

## GĐ4 – Tập viết, tập nghe, theo chủ đề (3 ngày)

Mục tiêu: thêm các chế độ nhớ lại và nghe, áp dụng thang chế độ theo mức thuộc.

**Prompt 4.1 – Chấm đáp án viết**

```text
Viết src/lib/grading/spelling.ts: checkAnswer(input, target, options) →
{ correct, typoCount, diff[] }.
- Bỏ qua hoa/thường, khoảng trắng thừa, dấu câu cuối.
- Khoảng cách Damerau-Levenshtein; 1 lỗi với từ ≥ 5 ký tự = đúng nhưng
  typoCount=1 (sẽ chấm Hard).
- Chấp nhận biến thể Anh–Mỹ/Anh–Anh (colour/color, organise/organize)
  và dạng chia đúng khi câu yêu cầu (went cho "go" thì quá khứ).
- diff từng ký tự để UI tô đỏ/xanh.
Unit test ít nhất 30 trường hợp.
```

**Prompt 4.2 – Chế độ tập viết 4 cấp gợi ý**

```text
Làm component WritingMode (cùng interface chế độ ở GĐ3):
- Đề bài: nghĩa tiếng Việt + loại từ, hoặc câu ví dụ khuyết từ.
- Cấp 1: xếp các ô chữ cái bị xáo trộn. Cấp 2: điền chữ khuyết
  (c_ll_c_t_on, ẩn khoảng 40% chữ). Cấp 3: chữ đầu + số ô trống.
  Cấp 4: ô nhập trống.
- Cấp khởi đầu theo masteryLevel; nút "Gợi ý" hạ 1 cấp và ghi
  hintLevel; dùng gợi ý thì tối đa chấm Hard.
- Sau khi trả lời: hiện diff, phát audio, cho gõ lại nếu sai.
- Bàn phím ảo không tự sửa/gợi ý (autocorrect=off, autocomplete=off).
```

**Prompt 4.3 – Chế độ tập nghe**

```text
Làm component ListeningMode với 3 dạng, chọn theo mức thuộc:
- Nghe → chọn nghĩa (mức 1).
- Nghe → gõ lại từ (mức 2–3), dùng checkAnswer.
- Nghe câu ví dụ → điền từ còn thiếu (mức 3–4).
Tự phát audio khi vào câu, nút nghe lại (đếm số lần, > 3 lần tính
là gợi ý), nút tốc độ 0.75x. Ngẫu nhiên giọng US/UK nếu người dùng
bật tùy chọn "luyện nhiều giọng". Trường hợp không có audio thì bỏ
qua chế độ này cho thẻ đó.
```

**Prompt 4.4 – Luyện theo chủ đề và chế độ tự chọn**

```text
Làm trang /practice:
- Chọn phạm vi: sổ tay, danh sách có chủ đích, chủ đề, tag, trạng thái.
- Chọn chế độ: một chế độ cụ thể hoặc "Trộn tự động" (pickMode).
- Chọn số câu: 10/20/30.
Quy tắc: từ chưa đến hạn luyện thêm vẫn ghi review_logs (cờ
is_extra=true) nhưng không đẩy due xa hơn, tránh làm sai lịch FSRS;
nếu trả lời sai thì vẫn cập nhật là Again.
Cập nhật "Ôn hôm nay" để dùng pickMode thay vì chỉ flashcard.
```

Tiêu chí hoàn thành: 5 chế độ chạy trong một phiên; mọi chế độ ghi `review_logs` đúng mode, hint\_level, response\_ms.

## GĐ5 – Tập phát âm (3 ngày)

Mục tiêu: người học thu âm, nhận điểm và biết âm nào sai; kết quả vào lịch phát âm riêng.

**Prompt 5.1 – Thu âm trên mọi trình duyệt**

```text
Viết hook useRecorder() dùng MediaRecorder:
- Xin quyền micro có giải thích trước (màn hình tiếng Việt); xử lý từ
  chối quyền và không có micro.
- Chọn định dạng theo trình duyệt (webm/opus trên Chrome, mp4/aac trên
  Safari iOS); giới hạn 5 giây cho từ, 10 giây cho câu; tự dừng khi
  im lặng 1,2 giây.
- Hiển thị sóng âm thanh khi thu.
- Chuyển sang WAV 16kHz mono trước khi gửi nếu dịch vụ chấm yêu cầu.
Kiểm thử thủ công trên Chrome desktop, Chrome Android, Safari iOS và
ghi kết quả vào docs/qa/recording.md.
```

**Prompt 5.2 – Chấm phát âm**

```text
Tạo Edge Function `assess-pronunciation`:
- Input: audio + reference text (từ hoặc câu) + locale (en-US/en-GB).
- Gọi Azure Speech Pronunciation Assessment (granularity = Phoneme),
  trả về { overall, accuracy, fluency, completeness, phonemes[] {
  ipa, score } }.
- Không lưu file ghi âm trên server sau khi chấm (quyền riêng tư);
  bản thu chỉ giữ trong bộ nhớ máy khách để nghe lại.
- Giới hạn 100 lần chấm/người/ngày.
Viết adapter interface PronunciationScorer để sau này đổi nhà cung cấp.
```

**Prompt 5.3 – Giao diện tập phát âm**

```text
Làm component SpeakingMode:
- Hiện từ + IPA, nút nghe mẫu (bình thường và chậm).
- Nút thu âm lớn; sau khi chấm: điểm 0–100, IPA tô màu từng âm vị
  (xanh ≥ 80, vàng 60–79, đỏ < 60), mẹo cho âm sai hay gặp với người
  Việt (/θ/, /ð/, âm cuối /s/ /t/ /d/, /ʃ/ vs /s/, trọng âm).
- Nút nghe lại bản thu của mình và mẫu liên tiếp để so sánh.
- Kết quả vào thẻ skill=speaking qua gradeFromOutcome; ghi chú "điểm
  chỉ mang tính tham khảo".
- Cho phép tắt chế độ phát âm (nơi công cộng) trong phiên ôn.
```

Tiêu chí hoàn thành: chạy được trên Chrome, Safari iOS và Android; thời gian từ lúc dừng thu đến khi có điểm dưới 3 giây.

## GĐ6 – Thống kê tiến bộ (3 ngày)

Mục tiêu: người học thấy rõ mình tiến bộ ra sao và cần tập trung vào đâu; FSRS tự điều chỉnh theo từng người.

**Prompt 6.1 – Tầng tính toán thống kê**

```text
Viết src/lib/stats (hàm thuần, đầu vào là review_logs + cards):
- streak hiện tại và dài nhất (theo múi giờ người dùng, ngày mới bắt
  đầu lúc 4:00 sáng).
- Số từ theo trạng thái: Mới / Đang học / Đã thuộc / Thành thạo.
- Tỉ lệ nhớ thực tế (true retention) 7/30 ngày, chỉ tính lượt ôn đến
  hạn, không tính is_extra.
- Số phút học mỗi ngày (từ response_ms), cho heatmap 365 ngày.
- Dự báo số thẻ đến hạn 7 và 30 ngày tới.
- Độ chính xác theo kỹ năng (meaning/spelling/listening/speaking).
- Danh sách leech và 10 từ sai nhiều nhất 30 ngày.
Unit test với bộ dữ liệu log mẫu cố định; đối chứng 3 chỉ số với
truy vấn SQL trực tiếp trên Supabase.
```

**Prompt 6.2 – Bảng điều khiển thống kê**

```text
Làm trang /stats, mobile-first, dùng Recharts:
- Hàng thẻ số: streak, tổng từ đã thuộc, tỉ lệ nhớ 30 ngày, phút học
  tuần này (so với tuần trước).
- Heatmap kiểu GitHub số phút học.
- Biểu đồ cột chồng số từ theo trạng thái qua thời gian.
- Biểu đồ cột dự báo tải 30 ngày.
- Radar hoặc cột ngang: độ chính xác theo kỹ năng.
- Danh sách "Từ hay quên" với nút Ôn ngay và Thêm ghi chú/ảnh.
Tính toán trên dữ liệu Dexie để mở được khi offline.
```

**Prompt 6.3 – Nhắc học và tối ưu FSRS cá nhân**

```text
1. Web Push (PWA): nhắc vào reminder_time nếu hôm đó chưa học, nội
   dung cụ thể ("12 từ đang chờ, khoảng 4 phút"); tối đa 1 lần/ngày;
   tắt được trong Cài đặt. Ghi chú hạn chế của push trên iOS.
2. Job chạy nền hàng tuần (Supabase cron + Edge Function hoặc worker
   Python dùng thư viện tối ưu FSRS): với người có ≥ 1.000 lượt ôn,
   tính tham số mới, chỉ áp dụng nếu log-loss trên tập kiểm tra tốt
   hơn tham số cũ; lưu lịch sử tham số để hoàn tác.
3. Cài đặt: cho chỉnh desired_retention 0.80–0.95 và hiển thị ước tính
   số thẻ ôn/ngày tương ứng trước khi lưu.
```

Tiêu chí hoàn thành: số liệu khớp truy vấn đối chứng; trang thống kê tải dưới 1 giây với 50.000 lượt log.

## GĐ7 – Admin và danh sách có chủ đích (4 ngày)

Mục tiêu: Admin tải danh sách, hệ thống tự phân tích và chuẩn bị nội dung, Admin duyệt rồi xuất bản; người học thêm danh sách vào sổ tay và học theo thời hạn.

**Prompt 7.1 – Khu vực Admin và tải danh sách**

```text
Làm khu vực /admin (layout desktop, chỉ vai trò admin; kiểm tra ở
middleware, server action và RLS):
- Danh sách curated_lists với trạng thái Nháp / Đang xử lý / Chờ duyệt
  / Đã xuất bản, số từ, số người học.
- Form tạo: tên, ngôn ngữ, CEFR mục tiêu, chủ đề, mục đích, số ngày
  gợi ý, ảnh bìa.
- Nguồn từ: (a) CSV/Excel có ánh xạ cột, (b) dán văn bản mỗi dòng một
  từ, (c) tải bài đọc/đề thi (PDF, ảnh, văn bản) để hệ thống tự trích từ,
  kèm tùy chọn "chỉ lấy từ từ cấp B2 trở lên".
- Bấm "Phân tích" → tạo import_jobs kind='admin_list', đẩy vào hàng
  đợi, chuyển trạng thái Đang xử lý, hiển thị tiến độ theo thời gian thực
  (Supabase Realtime).
```

**Prompt 7.2 – Pipeline phân tích tự động**

```text
Viết worker xử lý hàng đợi (Supabase Queues + Edge Function), mỗi bước
ghi kết quả để chạy lại được từ bước lỗi:
1. Trích xuất: với bài đọc, tách câu, tách từ, nhận cụm động từ/cụm
   từ (dùng prompt src/prompts/list-analyzer.md), giữ câu chứa từ.
2. Chuẩn hóa: normalizeEntry(), gộp trùng, gắn CEFR và tần suất; lọc
   theo trình độ nếu Admin yêu cầu.
3. Chọn nghĩa: từ nhiều nghĩa + có câu ngữ cảnh → LLM chọn sense phù
   hợp; không có ngữ cảnh → nghĩa phổ biến nhất + cảnh báo.
4. Nội dung: từ chưa có trong kho → gọi generate-word và word-media
   (song song tối đa 5), từ đã có → dùng lại.
5. Sắp xếp: nhóm theo chủ đề con, tần suất cao trước, từ cùng họ gần
   nhau, cặp dễ nhầm (affect/effect) cách xa nhau ít nhất 10 vị trí.
6. Cảnh báo: nghi sai chính tả (kèm gợi ý sửa), từ hiếm, vượt trình
   độ, nhiều nghĩa, LLM confidence thấp.
Xong → trạng thái Chờ duyệt. Test với danh sách 500 từ: hoàn thành
< 15 phút, ghi chi phí token vào import_jobs.
```

**Prompt 7.3 – Màn duyệt và xuất bản**

```text
Làm màn /admin/lists/[id]/review:
- Bảng từ: thứ tự, từ, loại từ, nghĩa đã chọn, CEFR, chủ đề con,
  cảnh báo; lọc "chỉ có cảnh báo"; kéo thả đổi thứ tự.
- Bấm một dòng → xem thẻ từ 5 tab, đổi nghĩa, sửa nội dung (sửa bản
  dùng chung đặt reviewed=true), tạo lại riêng một lớp, xóa từ.
- Thao tác hàng loạt: chấp nhận tất cả không có cảnh báo.
- Xuất bản → status='published', tăng version. Sửa danh sách đã xuất
  bản tạo version mới; người học đã thêm được hỏi có nhận từ mới không.
- Trang thống kê danh sách: số người học, tỉ lệ hoàn thành, tỉ lệ
  thuộc trung bình, 10 từ hay quên nhất.
```

**Prompt 7.4 – Thư viện, học theo thời hạn, kiểm tra đầu vào**

```text
Phía người học:
1. Trang /library: danh sách đã xuất bản, lọc theo ngôn ngữ, trình độ,
   mục đích; xem trước 20 từ đầu.
2. "Thêm vào sổ tay": chọn sổ có sẵn hoặc tạo sổ mới (source_list_id),
   chọn ngày mục tiêu (mặc định = số ngày gợi ý).
3. Kiểm tra đầu vào 3–5 phút: lấy mẫu 30 từ trải đều theo tần suất,
   hỏi "biết / không chắc / chưa biết" + 1 câu trắc nghiệm kiểm chứng cho
   từ trả lời "biết"; suy ra và đánh dấu từ đã biết (lên lịch ôn thưa,
   không dạy lại từ đầu).
4. src/lib/srs/pacing.ts: số từ mới/ngày = từ còn lại ÷ (ngày còn lại
   − 14); 14 ngày cuối chỉ ôn với desired_retention 0.95; cảnh báo khi
   số từ mới/ngày > 30. Unit test đầy đủ.
5. Trang sổ tay hiển thị tiến độ so với kế hoạch (đúng hạn / chậm X từ).
```

Tiêu chí hoàn thành: danh sách 500 từ xử lý xong dưới 15 phút, Admin cần sửa ≤ 2% từ; người dùng thường không truy cập được /admin (có test).

## GĐ8 – Kiểm thử và ra mắt beta (10 ngày)

Mục tiêu: ổn định, nhanh, dễ bắt đầu; sẵn sàng cho 10–20 người dùng thử.

**Prompt 8.1 – Bộ E2E hoàn chỉnh**

```text
Viết Playwright E2E cho các luồng (viewport iPhone 13 và desktop):
1. Dùng thử không tài khoản → thêm 3 từ → đăng ký → dữ liệu còn.
2. Onboarding → chọn bộ IELTS Environment → ôn 10 thẻ đủ 5 chế độ
   (mock audio/micro/chấm phát âm).
3. Mất mạng giữa phiên → ôn tiếp → có mạng → server nhận đủ log.
4. Nhập CSV 50 dòng có 3 dòng lỗi → báo đúng dòng lỗi.
5. Thống kê hiển thị đúng sau phiên ôn. 6. Thêm từ bằng ảnh mẫu (mock OCR) vào sổ tay. 7. Admin tải danh sách → duyệt → xuất bản → người học thêm vào sổ.
Thêm vào CI, chạy trên preview deployment của Vercel.
```

**Prompt 8.2 – Hiệu năng, PWA, khả năng truy cập**

```text
Rà soát và sửa để đạt Lighthouse ≥ 90 cả 4 mục trên mobile:
- PWA: manifest, icon, service worker (cache shell + audio đã nghe),
  cài đặt được lên màn hình chính, mở offline vào thẳng "Ôn hôm nay".
- Tải trước nội dung + audio của thẻ đến hạn ngày mai khi có Wi-Fi.
- Chuyển câu trong phiên ôn < 100ms; code-split theo chế độ.
- Truy cập: độ tương phản, aria-label, điều khiển bằng bàn phím, chế
  độ tối.
Báo cáo trước/sau trong docs/qa/performance.md.
```

**Prompt 8.3 – Onboarding, theo dõi lỗi, thu phản hồi**

```text
1. Onboarding: sau bước cài đặt, dẫn người dùng học 5 từ đầu tiên
   ngay (đủ một phiên ngắn) để họ trải nghiệm giá trị trong 2 phút.
2. Tích hợp Sentry (lỗi client + Edge Functions) và PostHog (sự kiện:
   word_added, session_started, session_completed, mode_used,
   reminder_opened) – không gửi nội dung cá nhân.
3. Nút "Góp ý" trong Cài đặt, lưu bảng feedback kèm phiên bản app.
4. Trang chính sách quyền riêng tư và ghi nguồn (Unsplash, từ điển).
5. Chức năng xuất toàn bộ dữ liệu (JSON, CSV) và xóa tài khoản.
```

Tiêu chí hoàn thành: E2E xanh, Lighthouse ≥ 90, không còn lỗi nghiêm trọng sau 2 tuần dùng thử.

## Prompt chạy bên trong ứng dụng

Các prompt này là một phần của sản phẩm (Edge Function gọi LLM), lưu trong `src/prompts/` và có phiên bản. Nên dùng chế độ trả JSON có cấu trúc (structured output/tool use) nếu nhà cung cấp LLM hỗ trợ. Ba prompt đầu (word-content, example-generator, mnemonic) chạy trên Gemini Flash gói miễn phí vì chỉ chứa kiến thức chung; hai prompt cuối (photo-word-picker, list-analyzer) chứa dữ liệu người dùng nên chạy trên Claude trả phí.

**word-content.md – Tạo nội dung đầy đủ cho một từ**

```text
Bạn là nhà từ điển học và giáo viên {language} cho người Việt.
Tạo nội dung học cho từ "{lemma}" (loại từ: {pos | "tất cả loại từ
 phổ biến"}). Người học ở trình độ {cefr_level}.
Ngữ cảnh người học gặp từ (nếu có, dùng để đưa nghĩa phù hợp lên đầu):
{context_sentence}
Dữ liệu từ điển tham khảo (ưu tiên khi mâu thuẫn): {dictionary_json}

Quy tắc:
- Chỉ đưa nghĩa phổ biến (tối đa 3), sắp theo tần suất sử dụng.
- meaning_vi ngắn gọn, tự nhiên, không dịch từ-đối-từ.
- 3 câu ví dụ mỗi nghĩa: ngữ cảnh đời thường, độ dài 8–18 từ, từ
  vựng xung quanh dễ hơn hoặc bằng {cefr_level}; có bản dịch tiếng Việt.
- synonyms: kèm nuance_vi nói rõ khác biệt sắc thái hoặc ngữ cảnh.
- collocations: chỉ cụm thực sự phổ biến (người bản ngữ hay dùng),
  nhóm theo mẫu (verb + noun, adj + noun, noun + of + noun…), tối đa 8.
- idioms: chỉ khi thực sự tồn tại; gắn register (formal, neutral,
  informal, slang, offensive). Không bịa. Không có thì trả mảng rỗng.
  Không tạo mục slang riêng.
- homonyms: từ viết/đọc giống nhưng nghĩa khác (vd bank, bat; pair/pear).
- common_mistakes: tối đa 3 lỗi người Việt hay mắc khi dùng nghĩa này
  (wrong, correct, explanation_vi), vd "resilient with stress" →
  "resilient to stress". Không có lỗi điển hình thì trả mảng rỗng.
- forms: dạng chia/số nhiều bất quy tắc, biến thể Anh–Mỹ nếu có.
- etymology: 1 câu tiếng Việt về gốc từ/tiền tố/hậu tố nếu giúp dễ nhớ.
- mnemonics: tối đa 2 mẹo ghi nhớ ngắn cho người Việt.
- confusables: từ hay bị nhầm với từ này + cách phân biệt (difference_vi).
- image_query: 2–4 từ tiếng Anh mô tả hình ảnh cụ thể, dễ nhớ.
- confidence: 0–1 cho từng mục idioms/collocations/mnemonics.
Trả về ĐÚNG JSON theo schema sau, không thêm chữ nào khác:
{json_schema}
```

**example-generator.md – Câu ngữ cảnh mới cho mức 3–4**

```text
Tạo 1 câu {language} mới dùng từ "{lemma}" theo nghĩa: "{definition_en}".
- Không trùng các câu người học đã gặp: {seen_sentences}
- Chủ đề người học quan tâm: {interests}. Trình độ: {cefr_level}.
- Ngữ cảnh đủ rõ để đoán được từ khi từ bị khuyết.
- Nếu có collocation phổ biến, ưu tiên dùng: {collocations}
Trả JSON: { "sentence", "cloze" (thay từ bằng ____), "answer" (đúng
 dạng xuất hiện trong câu), "translation_vi", "distractors" (3 từ
 cùng loại từ, sai nghĩa trong ngữ cảnh này) }
```

**mnemonic.md – Gợi ý ghi nhớ cho từ hay quên (leech)**

```text
Người học Việt đã quên từ "{lemma}" ({meaning_vi}) {lapses} lần, thường
nhầm với: {confused_with}. Đề xuất 3 cách ghi nhớ khác nhau:
1 liên tưởng âm thanh với tiếng Việt, 1 phân tích gốc từ/tiền tố/hậu
tố, 1 hình ảnh hoặc câu chuyện ngắn. Nếu bị nhầm, chỉ ra cách phân biệt.
Mỗi cách tối đa 2 câu. Trả JSON: { "mnemonics": [{ "type", "text_vi" }],
"distinguish_vi": string | null }
```

**photo-word-picker.md – Chọn từ mới trên ảnh**

```text
Dưới đây là văn bản OCR từ ảnh người học chụp (có thể có lỗi nhận dạng):
{ocr_text}
Người học ở trình độ {cefr_level}, đã biết các từ: {known_lemmas_sample}.
1. Sửa lỗi OCR rõ ràng (vd "rn" → "m"), không đổi nội dung.
2. Chọn tối đa 15 từ/cụm từ đáng học: chưa biết, không quá dễ so với
   trình độ, ưu tiên từ có ích và cụm động từ/collocation; bỏ tên riêng, số.
3. Với mỗi mục: dạng gốc, loại từ, nghĩa tiếng Việt theo ngữ cảnh này,
   câu gốc chứa nó, lý do chọn (≤ 10 từ).
Trả JSON: { "corrected_text", "items": [{ "surface", "lemma", "pos",
"meaning_vi", "sentence", "reason_vi" }] }
```

**list-analyzer.md – Phân tích danh sách/bài đọc của Admin**

```text
Bạn chuẩn bị danh sách từ vựng cho mục đích: "{purpose}", trình độ mục
tiêu {target_cefr}, chủ đề {topic}.
Dữ liệu đầu vào ({input_kind}: danh sách từ | bài đọc):
{input_chunk}
Yêu cầu:
- Với bài đọc: trích từ/cụm từ phù hợp mục đích và trình độ (bỏ từ
  quá cơ bản dưới {min_cefr}), giữ câu chứa nó.
- Với danh sách: không thêm bớt từ; chỉ chuẩn hóa và cảnh báo.
- Mỗi mục: lemma, pos, sense_hint (nghĩa phù hợp mục đích/ngữ cảnh),
  subtopic, cefr ước lượng, warnings[] trong: misspelling (kèm gợi ý),
  rare, above_level, polysemous, not_a_word.
- Đề xuất 3–6 chủ đề con để nhóm từ.
Trả JSON: { "subtopics": [string], "items": [{ "surface", "lemma",
"pos", "sense_hint", "subtopic", "cefr", "sentence", "warnings" }] }
Xử lý theo từng đoạn tối đa 200 từ/2.000 ký tự để tránh quá dài.
```

## Prompt tiện ích

Dùng xen kẽ ở mọi giai đoạn.

**Review cuối giai đoạn**

```text
Review toàn bộ thay đổi của giai đoạn [GĐx] so với nhánh main.
Kiểm tra theo thứ tự ưu tiên:
1. Đúng yêu cầu và tiêu chí hoàn thành trong docs/plan.md?
2. Bảo mật: RLS, khóa API lộ ra client, input chưa validate.
3. Dữ liệu: có đường nào làm mất hoặc trùng review_logs khi offline?
4. Logic SRS/chấm điểm có nằm ngoài src/lib hoặc thiếu test?
5. Mobile 360px, chuỗi hard-code chưa qua i18n, accessibility.
Liệt kê vấn đề theo mức (nghiêm trọng / nên sửa / góp ý) kèm file:dòng.
Không sửa gì cho đến khi tôi xác nhận. Cuối cùng đề xuất nội dung cần
thêm vào mục "Quyết định đã chốt" của CLAUDE.md.
```

**Sửa lỗi**

```text
Lỗi: [mô tả hiện tượng]. Các bước tái hiện: [1, 2, 3].
Kỳ vọng: [...]. Thực tế: [...]. Log/ảnh chụp: [dán vào đây].
Môi trường: [trình duyệt, thiết bị, online/offline].
Hãy: (1) viết test tái hiện lỗi và xác nhận test đỏ, (2) tìm nguyên
nhân gốc và giải thích, (3) sửa tối thiểu, (4) chạy lại toàn bộ test.
```

**Thêm ngôn ngữ mới (sau MVP)**

```text
Mở rộng ứng dụng cho ngôn ngữ [tiếng Nhật]. Phân tích những gì cần
thay đổi: language_extra trong schema (kanji, furigana, bộ thủ), prompt
word-content cho ngôn ngữ này, giọng TTS, chấm viết (kana/kanji, IME),
chấm phát âm (locale), bộ từ mẫu (JLPT N5–N1). Lập kế hoạch theo
bước, chỉ rõ điểm nào đang hard-code tiếng Anh cần tách ra.
```
