// File sinh tự động từ src/functions/transcribe/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/transcribe/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// src/lib/voice/azure-stt.ts
function createAzureStt(options) {
  const doFetch = options.fetch ?? fetch;
  return {
    async recognize(wav, lang) {
      const url = `https://${options.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed&profanity=raw`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": options.key,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json"
        },
        body: wav,
        signal: AbortSignal.timeout(15e3)
      });
      if (!response.ok) throw new Error(`Azure STT ${response.status}`);
      const data = await response.json();
      if (data.RecognitionStatus !== "Success") return { status: "no_match" };
      const alternatives = (data.NBest ?? []).map((n) => n.Display ?? n.Lexical ?? "").filter(Boolean);
      if (alternatives.length === 0 && data.DisplayText) alternatives.push(data.DisplayText);
      return alternatives.length ? { status: "ok", alternatives } : { status: "no_match" };
    }
  };
}

// src/functions/transcribe/handler.ts
import { z as z2 } from "npm:zod@4.6.5";

// src/lib/voice/candidates.ts
var MAX_CANDIDATES = 3;
function cleanTranscript(text) {
  return text.normalize("NFC").replace(/[’‘]/g, "'").replace(/^[\s"'“”.,;:!?…-]+|[\s"'“”.,;:!?…-]+$/g, "").replace(/\s+/g, " ").toLowerCase().trim();
}
function pickCandidates(alternatives, max = MAX_CANDIDATES) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  const sorted = [...alternatives].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  for (const alt of sorted) {
    const text = cleanTranscript(alt.transcript);
    if (!text || text.length > 64 || !/\p{L}/u.test(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= max) break;
  }
  return result;
}

// src/lib/voice/api.ts
import { z } from "npm:zod@4.6.5";
var SpeechLangSchema = z.enum(["en-US", "en-GB", "vi-VN"]);
var MAX_AUDIO_BASE64 = 45e4;
var TranscribeRequestSchema = z.object({
  lang: SpeechLangSchema,
  audio: z.string().min(100).max(MAX_AUDIO_BASE64)
});
var TranscribeResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), alternatives: z.array(z.string()).max(5) }),
  /** Không nghe ra chữ nào (im lặng, ồn). */
  z.object({ status: z.literal("no_match") }),
  /** Khách: chỉ dùng được nhận dạng của trình duyệt. */
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** Chưa cấu hình Azure hoặc dịch vụ lỗi. */
  z.object({ status: z.literal("unavailable") })
]);

// src/lib/voice/wav.ts
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function isWav(bytes) {
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length > 44 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

// src/functions/transcribe/handler.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}
function createTranscribeHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    let wav;
    try {
      body = TranscribeRequestSchema.parse(await request.json());
      wav = base64ToBytes(body.audio);
      if (!isWav(wav)) throw new Error("not wav");
    } catch (error) {
      return json(
        { error: error instanceof z2.ZodError ? "invalid_request" : "invalid_audio" },
        400
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
        result.alternatives.map((transcript) => ({ transcript }))
      );
      return json(alternatives.length ? { status: "ok", alternatives } : { status: "no_match" });
    } catch (error) {
      console.error("transcribe lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}

// src/functions/transcribe/main.ts
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}
var supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
var azureKey = Deno.env.get("AZURE_SPEECH_KEY");
var azureRegion = Deno.env.get("AZURE_SPEECH_REGION");
var stt = azureKey && azureRegion ? createAzureStt({ key: azureKey, region: azureRegion }) : null;
if (!stt) console.warn("Chưa có AZURE_SPEECH_KEY/AZURE_SPEECH_REGION: không nhận dạng giọng nói.");
Deno.serve(
  createTranscribeHandler({
    stt,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "transcribe"
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data;
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    }
  })
);
