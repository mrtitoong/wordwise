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
  (dấu "/" thành "-"), có bảo vệ đăng nhập Vercel. Công cụ Vercel MCP trong
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
