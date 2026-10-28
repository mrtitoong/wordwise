/**
 * HTTP handler của Edge Function fetch-article: đọc bài viết từ link người dùng dán (tab Link).
 *
 *   POST { url }
 *
 * Cần đăng nhập, giới hạn số bài mỗi ngày (usage_events kind "article"). Tải trang ở máy chủ (trình
 * duyệt không tải được trang của web khác), lấy nội dung chính bằng Readability, trả văn bản thuần.
 * Không gọi AI, không lưu bài.
 */
import { z } from "zod";
import { ArticleRequestSchema, type ArticleResponse } from "@/lib/article/api";
import {
  MIN_ARTICLE_WORDS,
  countWords,
  extractArticle,
  looksEnglish,
  truncateParagraphs,
} from "@/lib/article/extract";
import type { FetchedPage } from "@/lib/article/fetch-page";
import { checkArticleUrl } from "@/lib/article/url";

export interface ArticleDeps {
  fetchPage(url: string): Promise<FetchedPage>;
  getUserId(authorization: string | null): Promise<string | null>;
  /** Trừ một lượt nếu còn. */
  consumeUsage(userId: string): Promise<{ allowed: boolean; dailyLimit: number }>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: ArticleResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function createArticleHandler(deps: ArticleDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let url: string;
    try {
      ({ url } = ArticleRequestSchema.parse(await request.json()));
    } catch (error) {
      return json({ error: error instanceof z.ZodError ? "invalid_request" : "invalid_json" }, 400);
    }

    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId) return json({ status: "login_required" });
      const check = checkArticleUrl(url);
      if (!check.ok) return json({ status: check.reason });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });

      const page = await deps.fetchPage(check.url);
      if (!page.ok) {
        return json({ status: page.reason === "too_large" ? "not_html" : page.reason });
      }
      const article =
        page.kind === "text"
          ? {
              title: new URL(page.url).pathname.split("/").pop() || new URL(page.url).hostname,
              siteName: null,
              ...truncateParagraphs(
                page.html
                  .split(/\n\s*\n/)
                  .map((p) => p.replace(/\s+/g, " ").trim())
                  .filter(Boolean),
              ),
            }
          : extractArticle(page.html, page.url);
      if (!article || countWords(article.text) < MIN_ARTICLE_WORDS) {
        return json({ status: "no_article" });
      }
      if (!looksEnglish(article.text)) return json({ status: "not_english" });
      return json({ status: "ok", url: page.url, ...article });
    } catch (error) {
      console.error("fetch-article lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}
