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
- Next.js 16 App Router, TypeScript strict, Tailwind 4, shadcn/ui
- Supabase: Postgres, Auth, Storage, Edge Functions, Queues (pgmq),
  RLS bật cho mọi bảng
- Dexie.js (IndexedDB) cho offline-first
- ts-fsrs cho lập lịch; Zod cho validate; next-intl cho i18n
- LLM qua src/lib/llm: Claude Haiku 5.5 cho nội dung từ chung, Claude Sonnet 5.5
  cho tác vụ chứa dữ liệu người dùng (cấu hình ở src/config/llm.ts)
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
- 2026-10-20 (Prompt 1.1): Dùng **Next.js 16** (thay 15 trong plan.md), React 19,
  Tailwind 4, shadcn/ui (style new-york), next-intl 4. ESLint 9 (chưa lên 10 vì
  plugin của eslint-config-next chưa chắc hỗ trợ), Prettier + plugin Tailwind.
- 2026-10-20: Ngôn ngữ giao diện **không có tiền tố URL**. Thứ tự chọn: cookie
  `NEXT_LOCALE` → Accept-Language → `vi`. Đổi trong Cài đặt (server action
  `setLocale` + `router.refresh()`); từ Prompt 1.3 lưu thêm vào user_settings.
- 2026-10-20: Không dùng gói npm `cn` mà shadcn CLI tự thêm; dùng `cn()` trong
  `src/lib/utils.ts` (clsx + tailwind-merge). Sau mỗi lần `shadcn add`, kiểm tra
  import và package.json.
- 2026-10-20: CI (GitHub Actions) chạy cho **mọi nhánh** được đẩy lên: lint,
  format:check, typecheck, unit test, build, E2E Playwright (Chromium, 360px).
- 2026-10-20: Vercel: project `mrtitoong/wordwise`, `vercel.json` khai báo
  framework nextjs. Preview mỗi nhánh: `https://wordwise-git-<nhánh>-mrtitoong.vercel.app`
  (dấu "/" thành "-"), từ 2026-10-26 mở công khai (đã tắt bảo vệ đăng nhập Vercel). Công cụ Vercel MCP trong
  phiên Claude không có quyền vào scope `mrtitoong` (403); thao tác trên
  dashboard do chủ sản phẩm làm, trạng thái build đọc qua GitHub commit status.
- 2026-10-20 (Prompt 1.2): 13 bảng theo plan.md §5 + cột `words.details` (JSONB).
  Khóa ngoại kép `(id, user_id)` để không gắn được dữ liệu vào dòng của người
  khác. `profiles.role` (user/admin/teacher) người dùng không tự sửa được.
  `is_admin()` và `handle_new_user()` nằm ở schema `private` (không lộ qua /rpc).
- 2026-10-20: Seed 20 từ: nguồn là JSON trong `src/lib/schema/examples/` (đã
  validate Zod), sinh `supabase/seed/words.sql` bằng `scripts/build-seed.ts`;
  CI báo lỗi nếu file seed cũ. Admin mẫu `supabase/seed/local-users.sql` chỉ
  dùng ở máy/CI, không đưa lên cloud.
- 2026-10-20: `src/lib/db/database.types.ts` lấy từ **Supabase CLI**
  (`supabase gen types typescript --local --schema public`), không lấy từ trình
  sinh của cloud (khác định dạng). CI so khớp file này với schema.
- 2026-10-20: Supabase cloud: project `wordwise` (ref `jhvyyahowopzrpyenwdh`,
  ap-southeast-1), đã áp 6 migration qua Supabase MCP. Mã version trên cloud
  (20261020035222…) khác tên file local (20261020010000…); trước khi dùng
  `supabase db push` phải đồng bộ lịch sử bằng `supabase migration repair`.
- 2026-10-20 (Prompt 1.3): Đăng nhập bằng email gửi **cả link và mã 6 số**
  (mẫu `supabase/templates/magic-link.html`, link dạng token_hash →
  `/auth/confirm`, mở được ở trình duyệt khác) và Google OAuth (PKCE →
  `/auth/callback`). Mọi cách đăng nhập kết thúc ở `/auth/finish` (gộp dữ liệu
  khách, đặt cookie trạng thái). Email: tạm dùng SMTP mặc định của Supabase,
  chuyển sang Resend trước khi có người dùng thật.
- 2026-10-20: Chặn trang trong `src/proxy.ts` (Next 16 đổi middleware → proxy)
  bằng hàm thuần `decideAccess()`; cookie `ww_guest`, `ww_onboarded` chỉ là
  gợi ý điều hướng, quyền thật do Supabase Auth + RLS. `/admin` kiểm tra vai
  trò ở server (`requireAdmin()`, không phải admin → 404).
- 2026-10-20: Chế độ khách lưu trong Dexie với chủ `GUEST_OWNER` (Prompt 1.4
  thay localStorage của 1.3), không gửi lên server. Khi khách đăng
  nhập: tài khoản chưa onboarding thì lấy cài đặt của khách, đã có thì giữ của
  tài khoản; từ thì cộng thêm (trùng bỏ qua). Không dùng đăng nhập ẩn danh.
- 2026-10-20: "Học 5 từ này" hiện chỉ thêm 5 từ vào "Sổ của tôi" rồi về Hôm
  nay; phiên học ngắn nối vào ở GĐ3. Gợi ý khách tạo tài khoản sau 3 phiên/20
  từ làm khi có phiên ôn (GĐ3). Câu hỏi bật thông báo chỉ xin quyền và lưu giờ
  nhắc; gửi thông báo thật làm sau.
- 2026-10-20: Thiếu `NEXT_PUBLIC_SUPABASE_*` thì app vẫn chạy (chỉ chế độ
  khách, màn Đăng nhập báo chưa sẵn sàng). CI: job `e2e` chạy Supabase cục bộ
  + Mailpit để test đăng nhập bằng email; máy dev không có Docker nên các test
  này bị bỏ qua khi chạy ở máy.
- 2026-10-20 (Prompt 1.4): Offline-first: mọi ghi qua `src/lib/db/repo.ts` (Dexie
  + outbox trong một transaction); `src/lib/sync/engine.ts` đẩy theo lô 50 (thứ tự
  bảng cha → con), kéo theo `updated_at` (review_logs theo `created_at`, kéo
  trước cards), lùi 60 giây để không sót dòng commit muộn. Đồng bộ khi mở app,
  có mạng lại, quay lại tab, 2 giây sau mỗi ghi, mỗi 5 phút; Web Locks để chỉ
  một tab đồng bộ. Lỗi server quá 5 lần thì gác việc đó, báo trạng thái lỗi.
- 2026-10-20: **ID cố định (UUID v5)** cho user_words (chủ + nghĩa), cards (từ +
  kỹ năng), notebook_entries, sổ mặc định: hai máy cùng thêm một từ ra cùng
  ID. Khách đăng nhập thì tính lại ID theo tài khoản (`rekeyOwnedData`).
- 2026-10-20: Xung đột thẻ: lấy bản `last_review` mới nhất; số lượt ôn không
  khớp số review_logs thì tính lại bằng ts-fsrs từ toàn bộ lịch sử và gửi lên.
  Database có trigger `cards_a_keep_latest_review` chặn ghi đè bằng bản cũ hơn
  (vẫn nhận cờ xóa); server tự đặt `updated_at`/`created_at`. Xóa là xóa mềm
  (`deleted_at` ở notebooks, user_words, notebook_entries, cards).
- 2026-10-20: Thêm từ tạo sẵn một thẻ kỹ năng "meaning" (trạng thái New). Cài đặt
  chỉ gửi cột đã đổi. Đăng xuất: gửi nốt thay đổi, còn sót thì cảnh báo, rồi xóa
  dữ liệu trong máy. Cửa test `window.__wordwiseE2E` chỉ có khi build với
  `NEXT_PUBLIC_E2E=1` (job e2e của CI). Đồng bộ khi app đã đóng (Service Worker)
  để GĐ8.
- 2026-10-20 (Prompt 2.0): Lớp LLM `src/lib/llm` (router + adapter Claude, Gemini,
  Groq; SDK chính thức), cấu hình theo tác vụ ở `src/config/llm.ts`, đổi model bằng
  biến môi trường `LLM_MODELS_<TÁC_VỤ>`. Cờ `freeTier` gắn với model trong catalog;
  tác vụ `containsUserData` dùng model miễn phí (kể cả dự phòng) thì lỗi ngay khi
  nạp cấu hình. 429/5xx: chờ 1–2–4–8–16 s, quá 5 lần sang dự phòng. Sai schema gọi
  lại tối đa 2 lần. Nhật ký vào bảng `llm_call_logs` (admin đọc, service role ghi,
  không lưu nội dung prompt).
- 2026-10-20: **Chốt model sau so sánh 50 từ** (trang Artifact riêng tư
  https://claude.ai/artifact/Mt64g9tWj9KWTALvtvyPjM): nội dung từ chung
  (word-content, example-generator, mnemonic) → **Claude Haiku 5.5**, dự phòng
  **Sonnet 5.5** (Haiku 49/50 đúng schema lần đầu, ~$3.8/1.000 từ; Sonnet 50/50,
  ~$34/1.000 từ). Tác vụ chứa dữ liệu người dùng (photo-word-picker, list-analyzer)
  → Sonnet 5.5, dự phòng Haiku; xem lại ở Prompt 2.6/7.2. **Bỏ Gemini** khỏi cấu hình
  mặc định: gói miễn phí chỉ ~20 lượt/ngày và 80–130 s/từ (adapter vẫn giữ). Thay cho
  mô tả "Gemini Flash gói miễn phí" trong plan.md và docs/prompts.md.
- 2026-10-20: Schema thẻ từ 5 tab quá lớn cho structured output (Claude 400 "compiled
  grammar is too large", Gemini 400) → word-content dùng `schemaMode: "prompt"`: gửi
  JSON Schema trong prompt, chỉ bật chế độ JSON, Zod kiểm tra. Không dùng
  `zodOutputFormat()` của SDK Anthropic (bản 0.131 biến enum/const thành mô tả); dùng
  `toClaudeJsonSchema()`.
- 2026-10-20: Khóa LLM: máy dev để trong `.env.local` (chỉ cho `npm run
  compare:models`); app thật đọc từ Supabase Secrets trong Edge Functions (Prompt 2.1).
  Prompt trong app ở `src/prompts/*.md` có `version`; word-content v1 không chứa
  `context_sentence` của người dùng.
- 2026-10-21 (Prompt 2.1): Edge Function `generate-word`: tra kho → chưa có thì xếp việc
  vào bảng `word_jobs` (không dùng pgmq: cần đọc trạng thái từng việc, gộp yêu cầu trùng) và
  xử lý ngay bằng `EdgeRuntime.waitUntil`; pg_cron mỗi phút gọi worker (khóa
  `word_worker_secret` và `project_url` trong Vault). Haiku mất ~30 giây/từ nên từ mới luôn
  trả `preparing` ("Đang chuẩn bị nội dung"). Logic thuần ở `src/lib/words/pipeline.ts`.
- 2026-10-21: **Khách không tạo được từ mới** (chỉ dùng từ đã có trong kho, ngoài kho thì
  mời đăng nhập). Giới hạn trong `private.settings` (đổi bằng SQL): 50 từ mới/người/ngày,
  trần **1.000 từ mới/ngày** toàn hệ thống (~$4), từ tạo trước có trần riêng 1.000/ngày và
  chỉ chạy khi không có việc của người dùng. Ngày tính theo giờ Việt Nam.
- 2026-10-21: Từ gốc bằng `wink-lemmatizer` (WordNet, ~3 MB, chỉ dùng ở máy chủ) trong
  `src/lib/entry/lemma.ts`; giữ nguyên từ có nghĩa riêng (building, glasses, news,
  interesting…) và trả `alternatives` để app hỏi lại. normalizeEntry() đầy đủ làm ở Prompt
  2.4 dựa trên hàm này. Không ghi loại từ → **model chọn loại phổ biến nhất** (prompt
  word-content v2). Không lấy loại đầu tiên của từ điển: Wiktionary xếp theo nguồn gốc,
  thử 100 từ ra "and"/"by" là danh từ, "at" là động từ (đã xóa 31 từ v1, tạo lại).
- 2026-10-21: Free Dictionary API không ổn định (530/404 ngẫu nhiên) → lỗi thì chạy tiếp
  chỉ với LLM; chỉ dùng **nghĩa** làm tham khảo. **IPA giữ bản do AI viết** (chủ sản phẩm
  chốt sau xem mẫu): IPA từ điển hay là phiên âm kỹ thuật (ɹaɪt, d͡ʒʌst, ɡʊ(d)), không gửi
  vào prompt, không ghi đè. Thay cho "IPA lệch → dùng từ điển" ở plan.md §6 và Prompt 2.1.
  Prompt v3 yêu cầu ký hiệu kiểu Cambridge/Oxford. Nội dung từ chung viết ở mức B1. Dấu "/"
  quanh IPA do LLM trả về được tự bỏ (`preprocess` của router).
- 2026-10-21: Edge Function viết trong `src/functions/<tên>/main.ts`, đóng gói bằng esbuild
  (`npm run functions:build`) thành `supabase/functions/<tên>/index.js` (commit; CI kiểm tra
  khớp); thư viện npm thành `npm:tên@phiên-bản` theo package.json. Job CI `functions` chạy
  thử trên Supabase cục bộ. Tạo trước: danh sách **NGSL 1.2** (2.809 từ, CC BY-SA 4.0,
  `data/wordlists/`), `npm run pregenerate` chỉ xếp việc nguồn `bulk`, worker tự chạy dần.
- 2026-10-21 (Prompt 2.2): Audio bằng **Azure Speech** (REST, giọng en-US-AvaNeural /
  en-GB-SoniaNeural, MP3 24 kHz 48 kbps), khóa `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`.
  Audio **của từ** (Mỹ + Anh) tạo sẵn trong nền; audio **câu ví dụ chỉ tạo khi có người bấm
  nghe lần đầu** (khách chỉ nghe câu đã có), 100 câu mới/người/ngày; app chỉ gửi
  (senseId, index), máy chủ tự lấy câu nên không đọc được văn bản tùy ý. File trong bucket
  công khai `audio`: `en/{từ}/{loại từ}/{us|uk}.mp3`, câu `en/sentences/{sha-256}.mp3`; bảng
  `audio_clips` ghi số ký tự để theo dõi chi phí.
- 2026-10-21: Ảnh: **Pexels** trước (`PEXELS_API_KEY`, 200 lượt/giờ), Unsplash dự phòng
  (`UNSPLASH_ACCESS_KEY`); dùng thẳng URL của nhà cung cấp, lưu ghi nguồn trong
  `word_senses.image_credit` (provider, author, author_url, source_url). Không gắn ảnh cho
  giới từ, liên từ, đại từ, từ hạn định. Thiếu khóa thì bỏ qua, khi có khóa worker tự bổ
  sung. Worker `word-media` chạy mỗi phút qua pg_cron (8 từ, 3 lượt tìm ảnh mỗi lần).
- 2026-10-21: `<AudioButton>` (src/components/audio-button.tsx) phát MP3 với tốc độ 1x/0.75x
  (giữ cao độ), lỗi hoặc chưa có file thì đọc bằng Web Speech API theo giọng Mỹ/Anh.
- 2026-10-21 (Prompt 2.3): Thẻ từ `/words/[id]` (id = `words.id`, cả từ với mọi nghĩa) đọc
  IndexedDB trước, thiếu thì tải từ Supabase rồi lưu lại. Chip từ liên quan →
  `/words/lookup?lemma=` (trong máy → kho → generate-word; `add=1` thêm nghĩa 1 vào "Sổ của
  tôi"). Trang "Từ của tôi" tạm liệt kê từ đã thêm cho tới màn sổ tay ở Prompt 2.4.
- 2026-10-21: Nội dung "Của bạn" trong `user_words.user_additions` theo 5 tab (meaning,
  examples, usage, related, memory; Zod ở `src/lib/words/user-additions.ts`, tối đa 20 mục/tab,
  ≤ 64 KB). Tab Ghi nhớ lưu ở user_words của nghĩa đầu tiên người dùng có. Chỉ thêm/đổi được
  khi từ đã nằm trong sổ. Ghi đè cả cột khi hai máy cùng sửa (bản sửa sau thắng).
- 2026-10-21: **Câu ví dụ của người dùng (và câu gốc đã gặp) không có audio** (chủ sản phẩm
  chốt). Bản dịch câu ví dụ mặc định ẩn, bấm để hiện.
- 2026-10-21: Ảnh gợi nhớ tự tải lên: bucket riêng tư `user-images/{user_id}/`, thu nhỏ ≤ 800px,
  WebP/JPEG ≤ 512 KB, hiện bằng signed URL; `custom_image_url` dạng
  `storage://user-images/{user_id}/…` (ràng buộc DB chặn URL ngoài). Cần đăng nhập và có mạng.
- 2026-10-21: Báo lỗi vào bảng `content_reports` (lý do: incorrect, translation, pronunciation,
  inappropriate, other; ghi chú ≤ 500), cần đăng nhập, 20 báo cáo/người/ngày
  (`private.settings.user_daily_reports`). Admin xem/xử lý ở GĐ7. Nút "Ôn từ này" và "Gợi ý mẹo
  nhớ mới" để GĐ3; nội dung tạo một lần nên các tab hiện cùng lúc (không theo từng lớp).
- 2026-10-21 (Prompt 2.4): Chia hai nhánh: **2.4a** sổ tay + tab Gõ (`gd2/notebooks-typed`),
  **2.4b** nhập file + xuất CSV. **Bỏ định dạng Anki** (chủ sản phẩm chốt: không phổ biến);
  file chỉ CSV/Excel.
- 2026-10-21: **Gói Free/Premium** (`profiles.plan`, chưa thu tiền: admin bật bằng SQL
  `update profiles set plan = 'premium' …`). Free 50 từ mới (chưa có trong kho)/ngày, Premium 300
  (`private.settings.premium_daily_new_words`); trần hệ thống 1.000/ngày giữ nguyên. Hết lượt →
  màn "Nâng cấp Premium – sắp ra mắt". **Nhập file chỉ cho Premium**; khách không nhập file.
  Dán nhiều dòng ở tab Gõ miễn phí (từ mới vẫn tính vào 50). Cổng thanh toán làm prompt riêng.
- 2026-10-21: Từ chưa có trong kho thêm vào sổ: `word_job_requests` ghi sổ đích + câu gốc; khi tạo
  xong, `complete_word_job` tự thêm **nghĩa phổ biến nhất** vào sổ (ID UUID v5 giống máy khách),
  app đồng bộ về. Edge Function generate-word có thêm `action: "resolve"` (tra ≤ 50 từ, không tốn
  lượt) cho dán nhiều dòng; gợi ý khi gõ dùng hàm SQL `search_words` (offline: từ trong máy).
- 2026-10-21: Hàng "Sắp học": từ mới vào `status = queued`, mở dần theo `daily_new_limit` theo múi
  giờ người dùng (`user_words.introduced_at`), chạy khi thêm từ, mở app và sau mỗi lần đồng bộ.
  Trạng thái học: Sắp học / Đang học / Đã thuộc (ổn định ≥ 7 ngày) / Thành thạo (≥ 21 ngày) /
  Tạm ngưng; mức thuộc 0–4. Bỏ ràng buộc unique tên sổ ở DB (kẹt đồng bộ khi offline), UI kiểm
  tra trùng. Bìa sổ: 8 màu có sẵn hoặc ảnh tải lên (bucket user-images). Toast dùng chung
  `showToast()` (có Hoàn tác 5 giây). Không xóa được "Sổ của tôi".
- 2026-10-21 (Prompt 2.4b): **File chỉ là danh sách từ muốn học + gom nhóm** (chủ sản phẩm
  chốt): nội dung từ luôn lấy từ kho; cột nghĩa/ghi chú của file thành "Ghi chú của bạn" ở tab
  Nghĩa (riêng người đó), cột nghĩa còn dùng để chọn nghĩa khớp nhất trong kho; ví dụ → câu gặp;
  tag → `notebook_entries.tags`. CSV (papaparse) và .xlsx (read-excel-file) đọc trong trình
  duyệt, tối đa 10 MB/5.000 dòng; file không gửi lên máy chủ.
- 2026-10-21: Nhập file chỉ Premium: khách mời đăng nhập, Free thấy giới thiệu Premium; máy chủ
  trả `premium_required` khi tạo từ mới với `input_method = 'csv'` từ tài khoản Free. Việc nhập
  chạy nền trong trình duyệt (bảng Dexie `imports`, Web Locks), lô 50 từ có trong kho, từ mới gửi
  từng từ (ghi chú + tag đi theo `word_job_requests`); hết 300 từ mới/ngày thì chờ tới 0 giờ VN
  hôm sau rồi tự chạy tiếp; tiến độ ghi `import_jobs` (người dùng được cập nhật việc của mình).
- 2026-10-21: Xuất sổ ra CSV cho mọi người (kể cả khách): BOM UTF-8, CRLF, chặn công thức Excel;
  cột word, pos, meaning, example, note, tags, status, added_at (nhập lại được vào WordWise).
- 2026-10-21 (Prompt 2.5): Tab Nói dùng Web Speech API của trình duyệt (miễn phí, 3 phương án,
  `en-US`/`en-GB` theo giọng trong Cài đặt, tra ngược `vi-VN`); bấm giữ hoặc chạm một lần.
  Trình duyệt không có Web Speech → thu âm (MediaRecorder), chuyển WAV 16 kHz mono trong trình
  duyệt, gửi Edge Function **`transcribe` (Azure Speech, dùng chung khóa với TTS)**; cần đăng
  nhập, tối đa 10 giây/lần, 100 lần/người/ngày (`usage_events`, `consume_usage`); âm thanh không
  lưu. Chọn phương án → luồng tab Gõ (`SingleEntry` với `prefill`, cách nhập `voice`).
- 2026-10-21: Tra ngược tiếng Việt → tiếng Anh: hàm SQL `search_by_meaning` (bỏ dấu vẫn tìm được,
  khớp đúng dấu xếp trước), kho dưới 3 kết quả và đã đăng nhập thì hỏi AI (tác vụ
  `reverse-lookup`, Sonnet, dự phòng Haiku, 30 lượt/người/ngày) qua `generate-word`
  (`action: "reverse"`). Nói liên tục chỉ có với Web Speech; câu quá 3 từ tách thành từng từ,
  xem trước bằng bảng dán nhiều dòng.
- 2026-10-22 (Prompt 2.6): **Thêm từ bằng ảnh chỉ cho Premium** (chủ sản phẩm chốt; khách mời đăng
  nhập, Free thấy giới thiệu Premium), 30 ảnh/người/ngày (`usage_events` kind `ocr`,
  `private.settings.user_daily_ocr`). Máy chủ chặn ở cả `ocr-image` và `request_word_job`
  (`input_method = 'photo'` như `'csv'`). Edge Function `ocr-image`: **Google Cloud Vision**
  DOCUMENT_TEXT_DETECTION (khóa `GOOGLE_VISION_API_KEY`, gửi qua header), tin cậy TB < 0,75 hoặc lỗi
  thì **Claude Sonnet đọc lại** (tác vụ `photo-ocr`, dự phòng Haiku; chỉ có chữ, không có khung).
  Ảnh không lưu trên máy chủ. Lớp LLM nhận `images` (chỉ adapter Claude; Gemini/Groq báo lỗi).
- 2026-10-22: Trong trình duyệt: xoay 90°, cắt khung, thu nhỏ ≤ 2000px JPEG; cảnh báo tối/mờ/nhỏ
  trước khi đọc (ngưỡng ở `src/lib/ocr/image.ts`, chỉnh theo `npm run ocr:accuracy`), nghiêng > 10° sau
  khi đọc. **"Tự chọn từ mới" theo quy tắc, không gọi AI**: bỏ từ đã có, từ CEFR thấp hơn trình độ
  (chưa đặt thì bỏ A1), từ chức năng, tên riêng, số, chữ tin cậy < 0,6; ưu tiên từ khó; tối đa 15.
  Chọn tối đa 50 mục/lần; kéo ngang chọn cụm ≤ 6 từ trong một câu. Có hai cách xem: Ảnh (khung trên
  từng từ, phóng to) và Chữ (nút ≥ 44px; khung trên ảnh nhỏ hơn 44px là ngoại lệ).
- 2026-10-22: Mỗi từ giữ câu gốc làm `context_sentence` (≤ 300 ký tự quanh từ). Gợi ý sửa chính tả
  bằng hàm SQL `suggest_spellings` (levenshtein với kho, sai 1 ký tự, từ ≥ 7 ký tự sai 2). **"Giữ ảnh
  làm ngữ cảnh" mặc định tắt**; bật thì ảnh ≤ 1200px vào bucket `user-images`, gắn
  `notebook_entries.context_image_url` (ràng buộc DB chỉ nhận ảnh của chính người đó; từ mới mang theo
  qua `word_job_requests.context_image_url`), thẻ từ hiện bằng signed URL. Bộ ảnh mẫu ở
  `tests/fixtures/ocr` (6 ảnh tổng hợp + `real-*` do chủ sản phẩm chụp), kết quả ở `docs/qa/ocr.md`.
- 2026-10-22: Gộp Prompt 2.6 khi **Vision chưa chạy** (Google Cloud chưa bật thanh toán, 403
  `BILLING_DISABLED`; chủ sản phẩm chốt gộp trước): tab Ảnh tạm đọc bằng Claude Sonnet (đúng 100% từ
  trên 10 ảnh mẫu gồm 4 ảnh thật, ~$0,01/ảnh, chỉ có dạng Chữ). Bật thanh toán xong thì chạy lại
  `npm run ocr:accuracy`, không cần sửa code. Ảnh thật `tests/fixtures/ocr/real-*` chỉ giữ trên máy
  (repo công khai). Edge Function deploy bằng **Supabase CLI** (máy dev đã `supabase login`):
  `npx supabase functions deploy <tên> --project-ref jhvyyahowopzrpyenwdh --use-api` (không cần
  Docker; đọc `supabase/config.toml`, giữ verify_jwt = false).
- 2026-10-22 (GĐ3, chủ sản phẩm duyệt 5 đề xuất): **Một thang mức thuộc** (`src/lib/srs/mastery.ts`):
  0 mới · 1 đang học hoặc S < 3 · 2 (3–7 ngày) · 3 Đã thuộc (7–21) · 4 Thành thạo (≥ 21), thay mốc
  3/14/60 của plan.md §3.2; dùng chung cho chọn chế độ và nhãn sổ tay. **GĐ3 chỉ có thẻ Nghĩa**; thẻ
  Chính tả tạo ở GĐ4, Phát âm ở GĐ5 (mở khi Nghĩa đạt mức 2). Lịch: bước học 1m/10m, học lại 10m,
  tối đa 365 ngày, fuzz (hạt giống tất định nên tính lại thẻ vẫn khớp giữa các máy).
- 2026-10-22: Phiên ôn (`src/lib/srs/queue.ts`): R thấp trước, xen 1 từ mới/4 thẻ ôn, không để từ
  cùng gốc/họ/dễ nhầm hoặc cùng tag liền nhau, Quên quay lại sau 3–5 câu. **Quay lại nhẹ nhàng**
  (bỏ > 3 ngày hoặc còn > 100 thẻ dồn): tối đa 50 thẻ/ngày, dừng từ mới, **không sửa ngày đến hạn**
  của thẻ còn lại. Chủ đề ở GĐ3 = tag trong sổ. Mô phỏng 365 ngày ở `docs/qa/srs-simulation.md`
  (`npm run srs:simulate`): 10 từ/ngày → ~112 lượt/ngày cuối năm, tải tăng 1,3× khi số thẻ 2,35×;
  năm 2 vẫn tăng chậm (không đi ngang hẳn).
- 2026-10-22: **Ngày học** (chuỗi): ≥ 5 câu hoặc ôn hết hàng (theo múi giờ người dùng), 1 ngày nghỉ/
  tuần (thứ Hai–CN). "Ôn hết hàng", phiên dở, số phiên của khách lưu ở bảng `meta` (chỉ trong máy).
  "Ôn từ này"/"Ôn lại từ sai" khi thẻ chưa đến hạn là **ôn ngoài lịch** (`is_extra`): nhớ được thì
  không đổi lịch, quên thì tính như lượt ôn thật. "Học thêm 5 từ mới" mở từ Sắp học vượt giới hạn
  ngày (chỉ khi người dùng bấm). "Học 5 từ này" ở onboarding vào thẳng phiên ôn. Gợi ý khách tạo
  tài khoản sau 3 phiên hoặc 20 từ (ở màn kết quả). "Gợi ý mẹo nhớ mới" bằng AI để GĐ4.
- 2026-10-22: Chế độ ôn cùng giao diện `ModeProps` (`src/features/review/modes`), GĐ3 có flashcard
  (tự chấm 4 nút, phím 1–4, vuốt) và trắc nghiệm (tự chấm theo plan.md §3.3; đáp án nhiễu cùng loại
  từ, ưu tiên từ dễ nhầm; thiếu đáp án thì dùng flashcard; lấy thêm 120 từ thông dụng trong kho).
- 2026-10-22: Flashcard **giữ 4 nút tự chấm**, đổi nhãn "Được" thành **"Nhớ"** (Quên · Khó · Nhớ ·
  Dễ) cho dễ hiểu. Phương án 2 nút "Chưa nhớ / Nhớ rồi" (4 nút bật trong Cài đặt) để xem lại sau khi
  có người dùng thử.
- 2026-10-22 (GĐ4, chủ sản phẩm duyệt): Hai thẻ theo kỹ năng: **Nghĩa** (flashcard, trắc nghiệm,
  nghe → chọn nghĩa) và **Chính tả** (tập viết, nghe → gõ lại, nghe câu → điền từ), mỗi thẻ một lịch.
  Thẻ Chính tả tạo khi thẻ Nghĩa đạt **mức 1**; dùng chung giới hạn ôn/ngày; công tắc "Luyện chính tả"
  trong Cài đặt (mặc định bật); chạy lại mô phỏng 365 ngày với 2 thẻ. Tập viết: mức 0–1 **ngẫu nhiên**
  xếp chữ hoặc điền chữ thiếu (đúng tối đa "Nhớ"), mức 2 chữ đầu + số ô, mức 3–4 ô trống; "Gợi ý" hạ
  một cấp (tối đa "Khó"). "Luyện nhiều giọng" (US/UK ngẫu nhiên) mặc định tắt. Audio câu cho tập nghe
  tạo khi cần trong giới hạn 100 câu/ngày. Mẹo nhớ AI (Prompt 4.5): Haiku, chỉ gửi từ + nghĩa, cần đăng
  nhập, 10 lượt/người/ngày, lưu vào "Của bạn" ở tab Ghi nhớ. /practice chưa có "danh sách có chủ đích"
  (GĐ7).
- 2026-10-22 (Prompt 4.1): `src/lib/grading/spelling.ts`: `checkAnswer()` dùng Damerau-Levenshtein
  (bản OSA); sai 1 lỗi với từ ≥ 5 chữ cái (không tính khoảng trắng, nháy, gạch nối) là đúng + Khó.
  Biến thể Anh–Mỹ lấy từ `forms.variants` và tự áp lên dạng chia (`applyVariant`: colours → colors);
  gõ dạng khác của cùng từ → `wrong_form`; gõ trúng từ dễ nhầm (`confusables`) → `other_word`, không
  coi là lỗi gõ. `answersForWord(word, form?)` dựng đáp án từ nội dung trong kho.
- 2026-10-22 (Prompt 4.2): Thẻ Chính tả tạo khi thẻ Nghĩa **qua bước học** (state Review/Relearning
  = mức 1), trong `recordReview` và `ensureSkillCards()` (mở app, sau đồng bộ, đầu phiên); đến hạn cùng
  thẻ Nghĩa nhưng ≤ 1 ngày; mỗi ngày mở tối đa bằng số từ mới/ngày (từ học trước GĐ4 mở dần). Thẻ
  Chính tả mới không phải "từ mới" (không màn giới thiệu, không trừ giới hạn từ mới), xếp sau thẻ đến
  hạn. Tắt "Luyện chính tả" (`user_settings.practice_spelling`, đã áp lên cloud) chỉ lọc khỏi phiên, lịch
  giữ nguyên. Mô phỏng: 10 từ/ngày → quý 4 ~220 lượt/ngày (gấp ~2× chỉ thẻ Nghĩa; hạ tỉ lệ nhớ mục tiêu
  của thẻ Chính tả chỉ giảm 7–12% nên không dùng). Tập viết `src/features/review/modes/writing.tsx`:
  hint_level = số lần bấm Gợi ý (≤ 4); xếp chữ không chấp nhận lỗi gõ.
- 2026-10-22 (Prompt 4.3): Tập nghe `src/lib/review/listening.ts`. Thẻ Nghĩa từ mức 1 trở lên **trộn
  trắc nghiệm và nghe → chọn nghĩa** (pickMode giới hạn ở mức 1 cho thẻ Nghĩa, không chỉ còn nghe ở mức
  cao). Thẻ Chính tả: mức 0–1 tập viết; mức 2 tập viết/nghe → gõ; mức 3 cả ba; mức 4 tập viết/nghe câu →
  điền từ (chia đều). "Có audio" = có MP3 của từ hoặc trình duyệt đọc được; câu ví dụ xin audio qua
  word-media (khách/hết lượt thì trình duyệt đọc). Nghe lại > 3 lần (không tính lần tự phát) → dùng gợi
  ý (Khó, hint_level +1). `user_settings.multi_accent` (đã áp lên cloud) đổi ngẫu nhiên giọng mỗi câu
  nghe. Cài đặt: mục "Phiên ôn" (Luyện chính tả, Luyện nhiều giọng). Bản build E2E: `data-e2e-answer`
  và localStorage `ww_e2e_overrides` (ép dạng câu hỏi), hook `patchCards(skill, patch)`.
- 2026-10-22 (Prompt 4.4): Trang `/practice` (`src/features/practice/practice-screen.tsx`, lõi
  `src/lib/review/practice.ts`): phạm vi sổ tay · chủ đề (tag, không phân biệt hoa/thường) · trạng thái
  (Tất cả/Đang học/Đã thuộc/Thành thạo/Hay quên); chế độ Trộn tự động/Flashcard/Trắc nghiệm/Tập viết/
  Tập nghe; 10/20/30 câu. Chỉ luyện từ đã học (thẻ Nghĩa đã ôn, không Sắp học/Tạm ngưng); mỗi từ một
  câu, R thấp trước. Tập viết cần thẻ Chính tả; Tập nghe dùng thẻ Chính tả mức ≥ 2 (nghe → gõ) hoặc thẻ
  Nghĩa (nghe → chọn nghĩa). Thẻ chưa đến hạn là ôn ngoài lịch (`is_extra`), thẻ đến hạn là lượt ôn thật.
  Phiên `/review/session?practice=1&nb=&tag=&status=&mode=&n=`, `SessionItem.mode` ép chế độ.
- 2026-10-22: **Tạm bỏ Prompt 4.5** (mẹo nhớ bằng AI), làm sau (chủ sản phẩm chốt). Khi làm: nút "Gợi ý
  mẹo nhớ mới" ở tab Ghi nhớ + gợi ý cho từ hay quên, phương án A (Haiku, chỉ gửi từ + nghĩa, lưu vào
  "Của bạn", 10 lượt/ngày); cá nhân hóa bằng câu gặp/ghi chú (Sonnet) xem xét sau khi có người dùng thật.
  GĐ4 khép lại với 4 chế độ (flashcard, trắc nghiệm, tập viết, tập nghe); phát âm ở GĐ5.
- 2026-10-22 (GĐ5, chủ sản phẩm duyệt 6 đề xuất): Chấm phát âm cho **mọi tài khoản đã đăng nhập**
  (Free và Premium), 100 lần/người/ngày; khách mời đăng nhập. Thẻ Phát âm mở khi thẻ Nghĩa mức 2, mỗi
  ngày mở tối đa bằng số từ mới/ngày; công tắc **"Luyện phát âm" mặc định tắt** (Cài đặt → Phiên ôn), ai
  cũng luyện được ở trang Luyện tập. GĐ5 chỉ chấm **từ và cụm từ** (đọc câu để sau). Hiện dãy âm vị
  Azure trả về, tô màu từng âm (không khớp vào IPA của thẻ). Mẹo sửa âm cho người Việt theo quy tắc,
  không AI; chưa chấm trọng âm. Thiết bị thật (Safari iOS, Chrome Android) do chủ sản phẩm thử theo
  `docs/qa/recording.md`.
- 2026-10-22 (Prompt 5.1): Bộ thu chung `src/features/voice/recorder.ts` (`startRecording`,
  `blobToWavBase64`; tab Nói dùng chung), hook `useRecorder()` (5 giây, tự dừng khi im lặng 1,2 giây,
  sóng âm), logic thuần `src/lib/voice/recording.ts`. Lần đầu thu hiện màn giải thích quyền micro (cờ
  localStorage `ww_mic_explained`, đặt sau khi được cấp quyền). Trang **Cài đặt → Kiểm tra micro**
  (`/settings/microphone`). E2E thu âm dùng micro giả của Chromium (`e2e/recording.spec.ts`).
- 2026-10-22 (Prompt 5.2): Edge Function **`assess-pronunciation`** (đã deploy) → `PronunciationScorer`
  (`src/lib/pronunciation/scorer.ts`), bản đầu Azure Pronunciation Assessment qua REST short audio
  (WAV 16 kHz, header `Pronunciation-Assessment` base64 JSON: HundredMark, Phoneme, Comprehensive).
  Trả overall (PronScore), accuracy, fluency, completeness, từng từ và từng âm vị. **Azure chỉ trả tên
  âm vị IPA cho en-US**; en-GB vẫn có điểm từng âm nhưng `ipa: null`. Cần đăng nhập, usage kind
  `pronunciation` 100/ngày (`private.settings.user_daily_pronunciation`, đã áp lên cloud). Giá theo tài
  liệu Azure bằng STT tiêu chuẩn (~$1/giờ âm thanh, có nguồn ghi thêm ~$0,3/giờ) → ~$0,001/lần chấm 3
  giây. `npm run pronunciation:smoke` thử thật (cần khóa Azure trong .env.local).
- 2026-10-23 (Prompt 5.3): Màn tập phát âm `src/features/review/modes/speaking.tsx`: nghe mẫu (thường/
  chậm) → thu âm → điểm 0–100, âm tô màu **kèm ký hiệu** (✓ ≥ 80, ~ 60–79, ✗ < 60), tối đa 3 mẹo sửa âm
  cho âm < 70 (`src/lib/pronunciation/feedback.ts`, theo quy tắc), nghe lại bản của mình/so với mẫu,
  ghi chú "chỉ mang tính tham khảo". **Lần chấm đầu tiên dùng để xếp lịch** (< 60 Quên, 60–79 Khó,
  80–89 Nhớ, ≥ 90 Dễ), đọc lại chỉ để luyện; không chấm được (khách, hết lượt, lỗi) thì "Bỏ qua câu
  này", không ghi lượt ôn. Nút "Tạm tắt phát âm" ở đầu phiên bỏ các câu phát âm còn lại (thẻ vẫn
  đến hạn). `user_settings.practice_speaking` (mặc định tắt, đã áp lên cloud). Trang Luyện tập có chế
  độ Phát âm (khách mời đăng nhập). Giới hạn mở thẻ kỹ năng mới **riêng từng loại** (Chính tả, Phát
  âm) bằng số từ mới/ngày. Mô phỏng 3 thẻ: quý 4 ~328 lượt/ngày (gấp 2,9× chỉ Nghĩa), vượt giới hạn
  200/ngày thì dời sang hôm sau. E2E dùng micro giả (`tests/fixtures/audio/speech-then-silence.wav`)
  và chấm điểm giả lập.
- 2026-10-23 (GĐ6, chủ sản phẩm duyệt 8 đề xuất): **Ngày học bắt đầu lúc 4:00 sáng** cho mọi thứ tính
  theo ngày ở máy khách (chuỗi ngày, giới hạn từ mới/ngày, mở Sắp học, thống kê; `studyDay()` trong
  `src/lib/review/day.ts`); giới hạn ở máy chủ (chi phí) vẫn 0:00 giờ VN. Phút học = tổng thời gian trả
  lời, mỗi câu tối đa 60 giây. Độ chính xác 4 nhóm theo chế độ: Nghĩa (flashcard, trắc nghiệm), Viết,
  Nghe, Nói; đúng = không Quên. Từ theo trạng thái qua thời gian dựng lại từ lịch sử ôn (FSRS), mỗi
  tuần một cột, tối đa 52. Recharts (tải riêng ở /stats), heatmap tự vẽ. **Tối ưu tham số FSRS theo
  người để sau GĐ8** (chưa ai có 1.000 lượt ôn); GĐ6 làm chỉnh tỉ lệ nhớ 80–95% kèm ước tính số
  thẻ/ngày. Nhắc học bằng Web Push với Service Worker tối giản (khóa VAPID trong Supabase Secrets).
- 2026-10-23 (Prompt 6.1): `src/lib/stats/stats.ts` (`computeStats`): tỉ lệ nhớ thực tế chỉ lượt ôn
  đến hạn (state Review, không `is_extra`); dự báo tính thẻ đã ôn của từ đang học theo kỹ năng đang
  bật, quá hạn vào hôm nay; leech = thẻ bất kỳ quên ≥ 6 lần; "quên nhiều nhất" đếm lượt Quên 30 ngày
  (cả luyện thêm). Đối chứng SQL: bộ dữ liệu mẫu `src/lib/stats/fixture.ts` → `npm run stats:sql` sinh
  `supabase/tests/stats.test.sql` (pgTAP, CI kiểm tra file khớp). 50.000 lượt ôn tính ~0,3 giây
  (`localDay` lưu sẵn ngày theo khoảng 15 phút).
- 2026-10-23 (Prompt 6.2): Trang `/stats` (`src/features/stats/stats-screen.tsx`): 4 thẻ số (chuỗi,
  từ đã thuộc, tỉ lệ nhớ 30 ngày – "—" khi dữ liệu < 7 ngày, phút học 7 ngày so với 7 ngày trước),
  heatmap 365 ngày tự vẽ (SVG, cuộn ngang, chạm ô để xem ngày; mức 0/<5/<15/<30/≥30 phút), cột chồng
  trạng thái theo tuần và dự báo 30 ngày bằng **Recharts 3.10.1** (tải riêng bằng `next/dynamic`, mỗi
  biểu đồ có "Xem dạng bảng"), độ chính xác 4 kỹ năng (thanh ngang), "Từ hay quên" (quên nhiều nhất
  30 ngày rồi tới leech, tối đa 10; "Ghi chú/ảnh" mở thẻ từ, "Ôn ngay các từ này" →
  `/review/session?retry=` thẻ Nghĩa). Màu: một sắc xanh (`--chart-*` trong globals.css, bản tối riêng,
  đã chạy bộ kiểm tra bảng màu). Lịch sử trạng thái (FSRS) tính sau khi các số khác đã hiện. Chuỗi dài
  nhất tính một lượt (cách cũ chậm theo bình phương số ngày). Đo trên bản production với ~50.800 lượt
  ôn: số liệu hiện sau 0,34–0,94 giây (lần đầu sau khi server khởi động 1,7 giây), đọc IndexedDB chiếm
  ~0,5 giây; `npm run stats:perf` (CI) kiểm tra phần tính < 1 giây. `next.config.ts` đặt
  `agentRules: false` để `next dev` không tự chèn hướng dẫn vào CLAUDE.md. Cửa test E2E
  `seedHistory(days)` ghi lịch sử ôn giả trong máy.
- 2026-10-23: CI tăng tốc (chủ sản phẩm duyệt): E2E dùng **Google Chrome có sẵn trên máy ubuntu-latest**
  (`PLAYWRIGHT_CHANNEL=chrome`, bỏ bước tải Chromium từng mất tới 9 phút; máy dev vẫn dùng Chromium của
  Playwright); Supabase cục bộ khởi động chạy nền song song với npm ci (`scripts/ci-supabase.sh`). Theo
  dõi CI qua trang Actions công khai, không gọi API không đăng nhập quá dày (giới hạn 60 lượt/giờ).
- 2026-10-23 (Prompt 6.3): **Tỉ lệ nhớ mong muốn** 80/85/90/95% trong Cài đặt; chọn thì xem ước tính số
  thẻ/ngày (bảng tính sẵn bằng mô phỏng, `npm run srs:retention-table` → `src/lib/srs/retention-load.ts`),
  bấm Lưu mới đổi, chỉ ảnh hưởng lần ôn sau. **Nhắc học bằng Web Push**, cần đăng nhập: bảng
  `push_subscriptions` (ghi qua `save_push_subscription`, cùng trình duyệt đổi tài khoản thì chuyển sang
  người mới, tối đa 10 trình duyệt/người), `claim_due_reminders()` chọn người đã tới giờ nhắc (trễ ≤ 3
  giờ), chưa ôn trong ngày học (4:00), có việc để học, tối đa 1 lần/ngày (`private.reminders_sent`);
  pg_cron 5 phút gọi Edge Function **`send-reminders`** (`npm:web-push@3.6.7`, khóa VAPID: công khai ở
  `src/config/push.ts`, bí mật trong Supabase Secrets `VAPID_PRIVATE_KEY`). Nội dung kiểu "12 từ đang
  chờ ôn, khoảng 2 phút." theo `ui_locale`. Service Worker tối giản `public/sw.js` (chỉ nhận thông báo).
  Đăng nhập lại thì tự đăng ký nếu đã cho phép thông báo; đăng xuất thì hủy trên máy đó. iPhone/iPad chỉ
  nhận khi đã "Thêm vào Màn hình chính" (iOS 16.4+), Cài đặt có hướng dẫn. Đã áp lên cloud và deploy.
  Tối ưu tham số FSRS theo người để sau GĐ8.
- 2026-10-23: Repo **giữ công khai** (chủ sản phẩm chốt): không có khóa bí mật trong lịch sử git, CI miễn
  phí không giới hạn.
- 2026-10-23 (GĐ7, chủ sản phẩm duyệt 11 đề xuất): Khu Admin **tối ưu cho máy tính** (điện thoại vẫn dùng
  được: bảng cuộn ngang, nút ≥ 44px). Hàng đợi phân tích bằng **bảng + pg_cron** như word_jobs (không
  pgmq). Tiến độ: trang **hỏi lại mỗi 2 giây** (không Realtime). Bài đọc: PDF có chữ đọc bằng pdf.js trong
  trình duyệt, bản scan/ảnh qua `ocr-image` (Admin dùng như Premium); trích từ bằng `list-analyzer`
  (Sonnet). Chọn nghĩa có ngữ cảnh bằng **Haiku** (~20 từ/lần), không ngữ cảnh → nghĩa phổ biến nhất +
  cảnh báo. Việc của Admin chạy **20 từ song song**, không trừ giới hạn 50/300 từ/ngày của tài khoản, trần
  riêng **2.000 từ mới/ngày** cho danh sách Admin; ghi chi phí token. Sửa danh sách đã xuất bản: **bản
  nháp riêng**, xuất bản thì giữ mã danh sách, version + 1; người học thấy "có thêm N từ – Nhận/Bỏ qua";
  từ bị bỏ vẫn ở lại sổ. Kiểm tra đầu vào: "Biết" có thêm 1 câu trắc nghiệm, đúng → vào lịch như Đã thuộc
  (lần ôn đầu rải 1–4 tuần); từ ngoài mẫu: ngưỡng tần suất người học biết ≥ 80% → **đề xuất** đã biết,
  người học xem lại trước khi lưu. Lộ trình: sổ có ngày mục tiêu mở từ theo **chỉ tiêu riêng** cộng thêm
  ngoài số từ mới/ngày chung; tỉ lệ nhớ 0,95 chỉ cho thẻ của từ trong sổ ở 14 ngày cuối. Thống kê danh sách
  bằng hàm SQL chỉ trả số tổng hợp. Tài khoản admin: mr.titoong@gmail.com.
- 2026-10-23 (Prompt 7.1): `/admin` (`src/features/admin`): bảng danh sách (`admin_list_overview()`: số
  từ, số nguồn, số người học, việc mới nhất), lọc trạng thái, form khai báo (thêm cột
  `curated_lists.description`; ảnh bìa vào bucket công khai `list-covers`, chỉ admin ghi), trang chi tiết
  với nguồn từ (bảng `curated_list_sources`: `rows` CSV/Excel có ánh xạ cột – dùng chung
  `src/features/import/read-table.ts`, `lines` dán văn bản tối đa 5.000 dòng, `document` chữ bài đọc
  ≤ 200.000 ký tự/≤ 30 trang PDF) và phân tích (`start_list_analysis()` → `import_jobs` kind admin_list
  với `step`, `options.min_cefr`, token/chi phí; `retry_list_analysis()` chạy lại từ bước lỗi). Mọi thao
  tác qua server action có `requireAdmin()` + RLS. `experimental.serverActions.bodySizeLimit = 6mb`.
- 2026-10-23 (Prompt 7.2, chủ sản phẩm duyệt 4 đề xuất): Pipeline phân tích danh sách
  `src/lib/admin/analysis/` (hàm thuần + `pipeline.ts` điều phối), Edge Function **`analyze-list`**
  (pg_cron `list-worker` mỗi phút + tự gọi lượt mới khi hết giờ, lượt 140 giây). Kết quả từng từ trong
  bảng `curated_list_candidates` (stage raw → merged → triaged), lỗi 3 lần liên tiếp ở một bước → việc
  thất bại, danh sách về Nháp, Admin chạy lại từ bước lỗi. Bài đọc: Sonnet trích theo đoạn 8.000 ký tự,
  6 đoạn song song. **Từ chưa có trong kho được Haiku xem trước (chính tả, CEFR, độ hiếm, 100 từ/lượt)
  trước khi tạo nội dung**: sai chính tả thì tự sửa và cảnh báo, không phải từ tiếng Anh thì bỏ; bộ lọc
  "chỉ lấy từ cấp X trở lên" áp cho mọi nguồn (không chỉ bài đọc). Chọn nghĩa: một nghĩa → lấy luôn;
  cột nghĩa của file → `bestSenseByMeaning`; có câu → Haiku (`sense-picker`, 20 từ/lượt); không có →
  nghĩa phổ biến nhất + cảnh báo. Từ không ghi loại từ chọn trong nghĩa của mọi loại từ.
- 2026-10-23: Từ mới của danh sách Admin → `word_jobs.source = 'admin'` (`enqueue_admin_words`), ưu tiên
  sau việc của người dùng, trần riêng `admin_daily_new_words` 2.000/ngày, giữ đủ `admin_worker_parallel`
  = 20 worker generate-word (trừ số việc đang chạy). `word_jobs` ghi token/chi phí (`add_word_job_usage`),
  danh sách cộng chi phí của việc do nó tạo. **Không chờ audio/ảnh**: xong chữ là Chờ duyệt; word-media
  làm trước từ của danh sách Admin. Chủ đề con: tag đầu tiên nếu ≥ nửa số từ có tag, không thì Haiku
  (`list-subtopics`, ~25 từ/nhóm, 2–20 nhóm, chỉ khi ≥ 15 từ). Sắp xếp: nhóm theo độ thông dụng (trung
  vị), trong nhóm theo thứ hạng tần suất/CEFR, từ hiếm sau, cùng họ đứng cạnh, cặp dễ nhầm cách ≥ 10.
  Cảnh báo: spelling, rare (cờ AI hoặc C2), above_level, many_senses (≥ 3), no_context, low_confidence
  (chọn nghĩa < 0,6, nội dung < 0,5). Tóm tắt trong `import_jobs.state.summary`. Dữ liệu thử:
  `data/wordlists/nawl-1.2.csv` (NAWL, CC BY-SA 4.0). CI in lỗi pgTAP ra annotation công khai.
- 2026-10-23 (Prompt 7.3, chủ sản phẩm duyệt 5 đề xuất): Màn `/admin/lists/[id]/review`
  (`src/features/admin/review/`, logic thuần `src/lib/admin/review.ts`). `curated_list_items` là **bản làm
  việc** (cột `accepted`), chỉ admin đọc; **xuất bản** (`admin_publish_list`) chỉ khi mọi mục đã chấp
  nhận, sao sang `curated_list_releases` + `curated_list_release_items` (ai cũng đọc, ghi từ thêm/bỏ so
  với bản trước) và đặt `version`. Người học (GĐ 7.4) đọc bản phát hành, không đọc bản làm việc; danh sách
  đã từng xuất bản (`published_at`) vẫn hiện khi đang sửa. "Sửa danh sách" đưa về Chờ duyệt (bản nháp
  riêng), "Hủy bản nháp" khôi phục bản phát hành mới nhất. Phân tích lại giữ dấu đã chấp nhận theo nghĩa.
  Thông báo "có thêm N từ" cho người học làm ở 7.4. Kéo thả bằng **dnd-kit** (core 6.3.1, sortable
  10.0.0), tắt khi đang lọc; điện thoại dùng ô "Vị trí".
- 2026-10-23: Admin **sửa thẳng nội dung dùng chung** (`admin_save_word`: giữ id và số nghĩa, không đổi
  chữ/loại từ/audio/ảnh/dạng từ, đặt `reviewed = true`, `words.content_updated_at`); máy người học tự tải
  lại từ đã lưu khi đồng bộ (`SyncRemote.editedWords`, so `content_updated_at`). "Tạo lại một tab" bằng
  Edge Function **`admin-word`** (word-content, Haiku): tạo lại cả từ rồi chỉ lấy phần của tab đó, ghép
  nghĩa theo nội dung (`matchSenses`); trả bản nháp, Admin xem lại rồi bấm Lưu. Thẻ từ có chế độ
  `readOnly` (ẩn nút thêm/sửa/báo lỗi). Thống kê `/admin/lists/[id]/stats` bằng `admin_list_stats()`
  (theo bản phát hành mới nhất): người học, tỉ lệ hoàn thành (đã bắt đầu học hết), tỉ lệ đã bắt đầu, tỉ
  lệ "Đã thuộc" (thẻ Nghĩa S ≥ 7), 10 nghĩa nhiều lượt Quên nhất 30 ngày.
- 2026-10-25 (Prompt 7.4a, chủ sản phẩm duyệt 7 đề xuất): Thư viện `/library` (khách dùng được: xem,
  thêm vào sổ; hàm SQL `library_lists()` theo bản phát hành mới nhất, số người học chỉ là số tổng
  hợp). Mỗi danh sách **một sổ** (`notebooks.source_list_id`, `source_list_version` = bản đã nhận); sổ
  đích là sổ mới mang tên danh sách hoặc sổ có sẵn chưa gắn danh sách (không phải "Sổ của tôi"). Thêm
  từ theo thứ tự Admin sắp, chủ đề con thành tag, câu ngữ cảnh thành câu gặp, `input_method = 'list'`,
  `source = 'list:<id>'`; "Chọn lọc từ" bỏ tích từng từ. Lộ trình `src/lib/srs/pacing.ts`: từ của sổ có
  ngày mục tiêu **chỉ mở theo chỉ tiêu của sổ** (không dùng số từ mới/ngày chung; từ ở nhiều sổ theo sổ
  có hạn sớm nhất), chỉ tiêu = ceil(từ chưa mở trước hôm nay ÷ (số ngày còn lại − 14)) nên không đổi
  trong ngày; 14 ngày cuối (kể cả ngày mục tiêu) không mở từ mới, thẻ dùng tỉ lệ nhớ max(cài đặt, 0,95)
  trong `recordReview`; qua ngày mục tiêu thì sổ thành sổ thường. Ngày mục tiêu sớm nhất = hôm nay + 15.
  Quá 30 từ/ngày chỉ cảnh báo, không chặn. Tiến độ: "đã học" = thẻ Nghĩa đã ôn ít nhất một lần, "chậm X
  từ" = từ đã mở trước hôm nay mà chưa học. Từ đã có trong kho giữ lịch ôn, tính là đã học. Bản phát hành
  mới: sổ hỏi "có thêm N từ – Nhận/Bỏ qua" (`pendingListWords`, từ bị bỏ ở bản mới vẫn ở lại sổ; bản chỉ
  bỏ bớt từ thì tự ghi đã nhận). Giới hạn: tính lại thẻ từ lịch sử khi xung đột dùng tỉ lệ nhớ trong Cài
  đặt (không biết lượt nào ở 14 ngày cuối). Đã áp lên cloud. Kiểm tra đầu vào làm ở 7.4b (`gd7/placement`).
- 2026-10-26 (Prompt 7.4b, chủ sản phẩm duyệt): Kiểm tra đầu vào trong bảng "Thêm vào sổ tay" (sau bước
  ngày mục tiêu, tùy chọn, cần ≥ 10 từ chưa học; khách làm được). Logic thuần `src/lib/library/placement.ts`:
  độ khó = thứ hạng tần suất, không có thì ước theo CEFR, không có nữa thì không suy ra; ≤ 30 từ hỏi hết,
  nhiều hơn chia 5 nhóm độ khó × 6 từ. Biết → 1 câu trắc nghiệm (đáp án nhiễu từ chính danh sách), sai/Không
  chắc/Chưa biết = chưa biết; nhóm ≥ 80% biết (≥ 3 câu đã trả lời) → đề xuất cả nhóm. **Mặc định nhận hết đề
  xuất** (bấm Lưu), "Xem lại" là tùy chọn, theo nhóm có công tắc cả nhóm và mở từng từ (thay cho "xem lại
  trước khi lưu" ở GĐ7). Từ đã biết: thẻ Nghĩa đặt sẵn mức Đã thuộc (`placedCardFields`: state Review,
  7 ≤ S < 21, lần ôn đầu 7–28 ngày theo id thẻ, reps = 0), **không ghi review_logs** (thống kê không lẫn bài
  kiểm tra; xung đột phải tính lại thẻ thì từ đó coi như mới), `introduced_at` = hôm qua để không trừ chỉ tiêu
  từ mới; từ đã có lịch ôn giữ nguyên. Thẻ Chính tả của từ đã biết vẫn mở dần như thường. Chỉ làm lúc thêm
  danh sách (nút kiểm tra ở trang sổ để sau).
- 2026-10-26 (sửa luồng học từ mới, chủ sản phẩm duyệt): Màn từ mới trong phiên hiện **thẻ đủ 5 tab**
  (`WordCardBody` tách từ `word-card-screen.tsx`, `inSession`: mở sẵn tab Nghĩa, ẩn nút/link rời phiên,
  thêm "Của bạn" được bằng bảng nổi; chip từ liên quan mở `SessionChipSheet`: nghĩa ngắn nếu có trong máy +
  "Thêm vào Sắp học"). Bỏ link "Xem thẻ đầy đủ" và flashcard tự chấm ngay sau khi xem. "Đã xem xong" → **tự
  ghi lượt đầu "Khó"** (`INTRO_RATING`, mode flashcard, `correct = null` = `isIntroLog`), từ quay lại trong
  phiên dưới dạng trắc nghiệm/nghe → chọn nghĩa. Lượt này không tính vào độ chính xác (Thống kê, màn kết quả
  phiên), vẫn tính cho chuỗi ngày học. Flashcard 4 nút khi ôn từ cũ giữ nguyên.
- 2026-10-26 (bàn phím chữ cái, chủ sản phẩm chọn): Trên màn hình cảm ứng (`(pointer: coarse) and (hover:
  none)`), Tập viết, nghe → gõ lại, nghe câu → điền từ và ô "Gõ lại một lần cho nhớ" dùng **bàn phím chữ
  cái của app** (`src/features/review/modes/letter-keyboard.tsx`, logic `src/lib/review/keyboard.ts`): QWERTY
  chữ thường + gạch nối, nháy, dấu cách, xóa, nút Kiểm tra/Tiếp; không mở bàn phím hệ thống nên không có thanh
  gợi ý (Gboard/Samsung bỏ qua autocomplete/autocorrect = off) và bộ gõ tiếng Việt không đổi chữ. Ô đáp án là
  `role="textbox"` chỉ hiển thị; bàn phím Bluetooth vẫn gõ được. Máy tính giữ ô nhập thường. **Ngoại lệ vùng
  chạm**: phím chữ cao 48px nhưng rộng ~1/10 màn hình (~33px ở 360px) như bàn phím hệ thống.
- 2026-10-26 (danh sách "Đang chuẩn bị", chủ sản phẩm duyệt): Từ chưa có trong kho vừa thêm vào sổ (~30 giây
  tạo nội dung) hiện trong khung **"Đang chuẩn bị nội dung"** ở màn Thêm từ (mọi sổ) và trang sổ tay (sổ đó)
  (`src/features/add-word/preparing-list.tsx`, logic `src/lib/words/preparing.ts`): đọc `word_job_requests` +
  `word_jobs` của chính người dùng (24 giờ, có sổ đích), hỏi lại mỗi 5 giây khi còn từ đang chờ, có từ xong thì
  **đồng bộ ngay** (trước đây có thể chờ tới 5 phút); "đã vào sổ" hiện 10 phút rồi ẩn; lỗi có **Thử lại**
  (`retry_word_job()`: xếp lại việc, không thêm yêu cầu nên không trừ lượt từ mới/ngày, giữ
  `first_started_at`, tối đa 3 lần – cột `word_jobs.user_retries`). Chỉ tài khoản đã đăng nhập; không có từ
  nào thì không hiện. Màn Hôm nay không có dòng nhắc. Đã áp lên cloud.
- 2026-10-26 (Prompt 8.1, chủ sản phẩm duyệt 4 đề xuất): 7 luồng đầy đủ ở `e2e/journeys` chạy trên dự án
  Playwright **`iphone-13`** (kích thước/cảm ứng iPhone 13 nhưng bằng Chromium: micro giả, Web Speech) và
  **`desktop`** (1280px); test theo tính năng giữ ở `mobile-360`. Dịch vụ ngoài giả lập (chấm phát âm, OCR,
  generate-word); luồng Admin ghi kết quả phân tích rồi gọi `finish_list_analysis` thay worker. Cửa test
  `ww_e2e_overrides` nhận mảng (các câu lần lượt từng dạng), `patchCards(skill, patch, limit)`. Bản preview
  Vercel chỉ chạy **kiểm tra nhanh chế độ khách** (`e2e/smoke`, không ghi lên Supabase thật) qua workflow
  `preview-e2e.yml` (sự kiện `status` "Vercel" – Vercel không tạo GitHub Deployment; chỉ chạy từ `main`). Chủ
  sản phẩm đã **tắt Deployment Protection** nên preview mở công khai, không cần khóa bypass (bật lại thì thêm
  secret `VERCEL_AUTOMATION_BYPASS_SECRET`). Chi tiết `docs/qa/e2e.md`. Còn để 8.2: offline bấm "Xong" ra
  trang lỗi của trình duyệt (chưa có Service Worker lưu giao diện).
