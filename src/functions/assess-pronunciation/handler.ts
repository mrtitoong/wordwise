/**
 * HTTP handler của Edge Function assess-pronunciation (Prompt 5.2): chấm phát âm một từ/cụm từ.
 *
 *   POST { text, locale, audio }  – audio là WAV 16 kHz mono (base64), tối đa 5 giây.
 *
 * Cần đăng nhập (mọi gói), giới hạn lượt mỗi ngày (usage_events kind "pronunciation"). Bản thu chỉ
 * nằm trong bộ nhớ khi chấm, không được lưu.
 */
import { z } from "zod";
import {
  AssessRequestSchema,
  type AssessRequest,
  type AssessResponse,
} from "@/lib/pronunciation/api";
import type { PronunciationScorer } from "@/lib/pronunciation/scorer";
import { base64ToBytes, isWav } from "@/lib/voice/wav";

export interface AssessDeps {
  /** null khi chưa cấu hình Azure. */
  scorer: PronunciationScorer | null;
  getUserId(authorization: string | null): Promise<string | null>;
  /** Trừ một lượt nếu còn. */
  consumeUsage(userId: string): Promise<{ allowed: boolean; dailyLimit: number }>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: AssessResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function createAssessHandler(deps: AssessDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: AssessRequest;
    let wav: Uint8Array;
    try {
      body = AssessRequestSchema.parse(await request.json());
      wav = base64ToBytes(body.audio);
      if (!isWav(wav)) throw new Error("not wav");
    } catch (error) {
      return json(
        { error: error instanceof z.ZodError ? "invalid_request" : "invalid_audio" },
        400,
      );
    }

    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId) return json({ status: "login_required" });
      if (!deps.scorer) return json({ status: "unavailable" });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });

      const outcome = await deps.scorer.assess(wav, body.text, body.locale);
      return json(outcome.status === "ok" ? outcome : { status: "no_speech" });
    } catch (error) {
      console.error("assess-pronunciation lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}
