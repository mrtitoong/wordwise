/**
 * HTTP handler của Edge Function transcribe: nhận dạng giọng nói khi trình duyệt không có
 * Web Speech API (Firefox, một số bản Safari).
 *
 *   POST { lang, audio }  – audio là WAV 16 kHz mono (base64), tối đa 10 giây.
 *
 * Cần đăng nhập, giới hạn lượt mỗi ngày (usage_events). Âm thanh không được lưu lại.
 */
import { z } from "zod";
import { pickCandidates } from "@/lib/voice/candidates";
import {
  TranscribeRequestSchema,
  type TranscribeRequest,
  type TranscribeResponse,
} from "@/lib/voice/api";
import type { SpeechToText } from "@/lib/voice/azure-stt";
import { base64ToBytes, isWav } from "@/lib/voice/wav";

export interface TranscribeDeps {
  /** null khi chưa cấu hình Azure. */
  stt: SpeechToText | null;
  getUserId(authorization: string | null): Promise<string | null>;
  /** Trừ một lượt nếu còn. */
  consumeUsage(userId: string): Promise<{ allowed: boolean; dailyLimit: number }>;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: TranscribeResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function createTranscribeHandler(deps: TranscribeDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: TranscribeRequest;
    let wav: Uint8Array;
    try {
      body = TranscribeRequestSchema.parse(await request.json());
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
      if (!deps.stt) return json({ status: "unavailable" });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });

      const result = await deps.stt.recognize(wav, body.lang);
      if (result.status === "no_match") return json({ status: "no_match" });
      const alternatives = pickCandidates(
        result.alternatives.map((transcript) => ({ transcript })),
      );
      return json(alternatives.length ? { status: "ok", alternatives } : { status: "no_match" });
    } catch (error) {
      console.error("transcribe lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}
