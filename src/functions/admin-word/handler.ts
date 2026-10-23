/**
 * HTTP handler của Edge Function admin-word: Admin "tạo lại một tab" của thẻ từ khi duyệt danh
 * sách (Prompt 7.3).
 *
 *   POST { wordId, tab } → { status: "ok", content } – nội dung cả từ với tab đó đã thay bằng bản
 *   AI vừa tạo. Không ghi vào kho: Admin xem lại trong form rồi bấm Lưu (server action
 *   saveWordContent → admin_save_word).
 *
 * Chỉ admin (JWT + profiles.role). Nội dung từ chung không chứa dữ liệu người dùng → word-content
 * (Haiku) như khi tạo từ mới.
 */
import { z } from "zod";
import { mergeRegeneratedTab, REGENERATE_TABS, type RegenerateTab } from "@/lib/admin/review";
import type { WordContent } from "@/lib/schema/word";

export const AdminWordRequestSchema = z.object({
  wordId: z.uuid(),
  tab: z.enum(REGENERATE_TABS),
});

export type AdminWordResponse =
  { status: "ok"; content: WordContent } | { status: "forbidden" | "not_found" | "unavailable" };

export interface AdminWordDeps {
  getUserId(authorization: string | null): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
  loadWord(wordId: string): Promise<WordContent | null>;
  /** null khi chưa có khóa LLM. */
  generate: ((current: WordContent, tab: RegenerateTab) => Promise<WordContent>) | null;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: AdminWordResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function createAdminWordHandler(deps: AdminWordDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: z.infer<typeof AdminWordRequestSchema>;
    try {
      body = AdminWordRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId || !(await deps.isAdmin(userId))) return json({ status: "forbidden" }, 403);
      const current = await deps.loadWord(body.wordId);
      if (!current) return json({ status: "not_found" }, 404);
      if (!deps.generate) return json({ status: "unavailable" });
      const generated = await deps.generate(current, body.tab);
      return json({ status: "ok", content: mergeRegeneratedTab(current, generated, body.tab) });
    } catch (error) {
      console.error("admin-word lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}
