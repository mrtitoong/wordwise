---
name: wordwise-prompt-workflow
description: Quy trình làm một prompt/tính năng/sửa lỗi của WordWise từ đầu đến cuối – đề xuất kế hoạch bằng tiếng Việt và chờ duyệt, tạo nhánh, code + test, gộp main, báo cáo. Dùng khi chủ sản phẩm giao một Prompt trong docs/prompts.md (vd "làm Prompt 8.3"), một tính năng mới hoặc một lỗi cần sửa.
---

# Làm một prompt WordWise

Chủ sản phẩm không viết code. Mọi trao đổi bằng tiếng Việt dễ hiểu, ít thuật ngữ; xưng "tôi", gọi "anh/chị".

## Bước 1 – Đề xuất (chưa code)
1. Đọc prompt trong `docs/prompts.md` (nếu có), phần liên quan trong `docs/plan.md`, và các quyết định trong
   CLAUDE.md. Quyết định trong CLAUDE.md **thay cho** mô tả cũ trong plan.md/prompts.md.
2. Xem code hiện có của mảng đó (đừng đề xuất thứ đã có).
3. Gửi:
   - Tóm tắt kế hoạch: sẽ làm gì, người dùng thấy gì.
   - **Các lựa chọn cần quyết**, đánh số, mỗi cái có **đề xuất + lý do** (chi phí, trải nghiệm, bảo mật).
   - Việc lớn thì đề xuất chia nhánh (vd 2.4a/2.4b).
4. **Dừng, chờ duyệt.** Không code trước khi được đồng ý.

## Bước 2 – Code
- Nhánh: `gd<N>/<tên-ngắn>` cho prompt theo giai đoạn, `feat/…`, `fix/…`, `chore/…` cho việc ngoài. Tạo từ `main`.
- Theo quy ước CLAUDE.md:
  - Chuỗi giao diện qua next-intl: `src/messages/vi.json` + `en.json`.
  - Logic nghiệp vụ là hàm thuần trong `src/lib/` và có unit test.
  - Nút bấm ≥ 44px, dùng được ở 360px.
  - Ghi IndexedDB trước, đồng bộ sau.
- Database → skill `wordwise-migration`. Edge Function → skill `wordwise-edge-function`.
  React/Next → tham khảo `vercel-react-best-practices`.
- Chỉ hỏi lại giữa chừng khi việc ảnh hưởng người dùng, chi phí hoặc bảo mật. Còn lại tự quyết theo đề xuất đã duyệt.
- Commit nhỏ, Conventional Commits (`feat(review): …`, `fix(sync): …`), kết thúc bằng dòng Co-Authored-By.

## Bước 3 – Kiểm tra (sửa đến khi xanh)
```bash
npm run typecheck && npm run lint && npm run format:check && npm test
npm run build            # khi đổi trang/route/config
npm run test:e2e         # khi đổi luồng giao diện (test cần Supabase tự bỏ qua ở máy dev)
```
- Thêm/sửa test E2E trong `e2e/` cho luồng mới (dự án `mobile-360`; luồng đầy đủ trong `e2e/journeys`).
- Push nhánh, theo dõi CI (skill `wordwise-ci`) đến khi mọi job xanh.
- Có migration/Edge Function: áp lên cloud và deploy theo skill tương ứng.

## Bước 4 – Gộp và ghi quyết định
- Thêm một mục vào "Quyết định đã chốt" trong CLAUDE.md:
  - Dạng `- YYYY-MM-DD (Prompt X.Y, chủ sản phẩm duyệt …): …`.
  - Chỉ ghi điều không đọc được từ code: lựa chọn đã chốt, giới hạn, lý do, việc để sau, đã áp cloud/deploy chưa.
- Gộp vào main: `git merge --no-ff <nhánh> -m "Merge branch '<nhánh>' (<mô tả>)"`, push.

## Bước 5 – Báo cáo (ngắn)
- **Đã làm gì** (theo góc nhìn người dùng).
- **Kết quả test**: số test, CI xanh/đỏ. Nói thật nếu có gì chưa đạt hoặc bỏ qua.
- **Link preview**: `https://wordwise-git-<nhánh, "/" thành "-">-mrtitoong.vercel.app`, hoặc `…-git-main-…` sau khi gộp.
- **Tối đa 10 việc cần thử tay**, đánh số, mỗi việc có kết quả mong đợi. Ưu tiên phần test tự động không thử được:
  thiết bị thật, micro, dịch vụ ngoài thật, tài khoản thật.
- Việc chủ sản phẩm phải tự làm (tài khoản, khóa API): hướng dẫn từng bước, không xin dán khóa vào chat.
