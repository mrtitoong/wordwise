/**
 * HTTP handler của Edge Function analyze-list (chuẩn Web Request/Response, chạy được ở Deno và
 * trong Vitest). Chỉ pg_cron (và chính worker) gọi:
 *
 *   POST { action: "work" } kèm header x-worker-secret – chạy một lượt worker phân tích danh sách.
 *
 * Lượt hết giờ giữa chừng thì gọi lượt mới ngay (không chờ pg_cron 1 phút).
 */
import { z } from "zod";
import { runListWorker, type AnalysisDeps } from "@/lib/admin/analysis/pipeline";

export interface AnalyzeListDeps {
  /** null khi chưa cấu hình khóa LLM. */
  worker: AnalysisDeps | null;
  verifyWorkerSecret(secret: string): Promise<boolean>;
  /** Gọi lượt worker mới (qua pg_net). */
  kickNext(): Promise<void>;
  budgetMs?: number;
}

const BodySchema = z.object({ action: z.literal("work") });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function createAnalyzeListHandler(deps: AnalyzeListDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      BodySchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const secret = request.headers.get("x-worker-secret") ?? "";
    if (!secret || !(await deps.verifyWorkerSecret(secret))) {
      return json({ error: "unauthorized" }, 401);
    }
    if (!deps.worker) return json({ error: "llm_not_configured" }, 503);

    try {
      const result = await runListWorker(
        deps.worker,
        deps.budgetMs ? { budgetMs: deps.budgetMs } : {},
      );
      if (result.more) {
        await deps.kickNext().catch((error) => console.error("Gọi lượt tiếp lỗi:", error));
      }
      return json(result);
    } catch (error) {
      console.error("analyze-list lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
