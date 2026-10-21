/**
 * HTTP handler của Edge Function generate-word (chuẩn Web Request/Response, chạy được ở
 * Deno và trong Vitest).
 *
 *   POST { lemma, language?, pos?, notebookId? } – app xin nội dung từ (xem WordResponse).
 *   POST { action: "resolve", lemmas } – tra nhiều từ trong kho (dán nhiều dòng), không tạo việc.
 *   POST { action: "reverse", query }  – tra ngược tiếng Việt → tiếng Anh (kho, rồi AI).
 *   POST { action: "work" }          – pg_cron gọi worker, kèm header x-worker-secret.
 */
import { z } from "zod";
import { FunctionRequestSchema, type WordResponse } from "@/lib/words/api";
import { reverseLookup, type ReverseDeps } from "@/lib/words/reverse";
import {
  requestWord,
  resolveWords,
  runWorker,
  type JobOutcome,
  type PipelineDeps,
  type WorkerDeps,
} from "@/lib/words/pipeline";

export interface HandlerDeps {
  pipeline: PipelineDeps;
  reverse: ReverseDeps;
  /** null khi chưa cấu hình khóa LLM: vẫn tra kho và xếp việc, cron xử lý sau. */
  worker: WorkerDeps | null;
  /** id người dùng từ header Authorization, null nếu là khách/khóa công khai. */
  getUserId(authorization: string | null): Promise<string | null>;
  verifyWorkerSecret(secret: string): Promise<boolean>;
  /** Giữ function chạy tiếp sau khi đã trả lời (EdgeRuntime.waitUntil). */
  waitUntil(promise: Promise<unknown>): void;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

function summarize(outcomes: JobOutcome[]) {
  return {
    processed: outcomes.length,
    done: outcomes.filter((o) => o.status === "done").length,
    retry: outcomes.filter((o) => o.status === "retry").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  };
}

export function createHandler(deps: HandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: z.infer<typeof FunctionRequestSchema>;
    try {
      body = FunctionRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    try {
      if (body.action === "work") {
        const secret = request.headers.get("x-worker-secret") ?? "";
        if (!secret || !(await deps.verifyWorkerSecret(secret))) {
          return json({ error: "unauthorized" }, 401);
        }
        if (!deps.worker) return json({ error: "llm_not_configured" }, 503);
        return json(summarize(await runWorker(deps.worker)));
      }

      if (body.action === "resolve") return json(await resolveWords(body, deps.pipeline));

      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (body.action === "reverse") return json(await reverseLookup(body, userId, deps.reverse));
      const response: WordResponse = await requestWord(body, userId, deps.pipeline);
      if (response.status === "preparing" && deps.worker) {
        // Xử lý ngay việc vừa xếp; lỗi đã được ghi vào việc, cron sẽ thử lại.
        deps.waitUntil(
          runWorker(deps.worker, { jobId: response.jobId, maxJobs: 1 }).catch((error) =>
            console.error("Worker lỗi:", error),
          ),
        );
      }
      return json(response);
    } catch (error) {
      console.error("generate-word lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
