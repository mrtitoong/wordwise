/**
 * HTTP handler của Edge Function word-media (chuẩn Web Request/Response).
 *
 *   POST { action: "sentence", senseId, index, voice }  – app xin audio câu ví dụ.
 *   POST { action: "work" }                              – pg_cron gọi worker (x-worker-secret).
 */
import { z } from "zod";
import { MediaFunctionRequestSchema } from "@/lib/media/api";
import { requestSentenceAudio, runMediaWorker, type MediaDeps } from "@/lib/media/pipeline";

export interface MediaHandlerDeps {
  media: MediaDeps;
  getUserId(authorization: string | null): Promise<string | null>;
  verifyWorkerSecret(secret: string): Promise<boolean>;
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

export function createMediaHandler(deps: MediaHandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: z.infer<typeof MediaFunctionRequestSchema>;
    try {
      body = MediaFunctionRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    try {
      if (body.action === "work") {
        const secret = request.headers.get("x-worker-secret") ?? "";
        if (!secret || !(await deps.verifyWorkerSecret(secret))) {
          return json({ error: "unauthorized" }, 401);
        }
        return json(await runMediaWorker(deps.media));
      }

      const userId = await deps.getUserId(request.headers.get("authorization"));
      const { senseId, index, voice } = body;
      return json(await requestSentenceAudio({ senseId, index, voice }, userId, deps.media));
    } catch (error) {
      console.error("word-media lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}
