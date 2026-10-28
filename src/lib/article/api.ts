/**
 * Hợp đồng của Edge Function fetch-article (tab Link), dùng chung cho máy chủ và app.
 *
 *   POST { url } – link bài viết tiếng Anh.
 */
import { z } from "zod";
import { MAX_URL_LENGTH } from "./url";

export const ArticleRequestSchema = z.object({
  url: z.string().trim().min(4).max(MAX_URL_LENGTH),
});

export const ArticleResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** Địa chỉ cuối cùng (sau chuyển hướng), lưu làm nguồn của từ. */
    url: z.string(),
    title: z.string(),
    siteName: z.string().nullable(),
    /** Văn bản thuần, các đoạn cách nhau bằng dòng trống. */
    text: z.string(),
    /** Bài quá dài, chỉ lấy phần đầu. */
    truncated: z.boolean(),
  }),
  z.object({ status: z.literal("invalid_url") }),
  /** Địa chỉ nội bộ/không được phép. */
  z.object({ status: z.literal("blocked") }),
  /** Trang lỗi, cần đăng nhập, chặn trình tải, hết giờ… */
  z.object({ status: z.literal("fetch_failed") }),
  /** Không phải trang web (PDF, ảnh…) hoặc quá lớn. */
  z.object({ status: z.literal("not_html") }),
  /** Không tìm thấy nội dung bài (trang chủ, trang chỉ hiện bằng JavaScript…). */
  z.object({ status: z.literal("no_article") }),
  z.object({ status: z.literal("not_english") }),
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** Mất mạng hoặc dịch vụ lỗi. */
  z.object({ status: z.literal("unavailable") }),
]);

export type ArticleResponse = z.infer<typeof ArticleResponseSchema>;
export type ArticleFailure = Exclude<ArticleResponse["status"], "ok">;
