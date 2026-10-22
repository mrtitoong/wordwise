// File sinh tự động từ src/functions/assess-pronunciation/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/assess-pronunciation/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// src/lib/voice/wav.ts
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
}
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

// src/lib/pronunciation/scorer.ts
function assessmentParams(text, locale) {
  return {
    ReferenceText: text,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    ...locale === "en-US" ? { PhonemeAlphabet: "IPA" } : {}
  };
}
function assessmentHeader(text, locale) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(assessmentParams(text, locale))));
}
var clamp = (value) => Math.max(0, Math.min(100, Math.round((value ?? 0) * 10) / 10));
var scores = (item) => ({ ...item, ...item.PronunciationAssessment });
function parseAzureAssessment(body) {
  const best = body.NBest?.[0];
  if (body.RecognitionStatus !== "Success" || !best) return { status: "no_speech" };
  const top = scores(best);
  const words = (best.Words ?? []).map((word) => {
    const w = scores(word);
    return {
      word: word.Word ?? "",
      accuracy: clamp(w.AccuracyScore),
      errorType: w.ErrorType ?? "None",
      phonemes: (word.Phonemes ?? []).map((phoneme) => ({
        ipa: phoneme.Phoneme?.trim() || null,
        score: clamp(scores(phoneme).AccuracyScore)
      }))
    };
  });
  if (words.length && words.every((w) => w.errorType === "Omission"))
    return { status: "no_speech" };
  return {
    status: "ok",
    result: {
      overall: clamp(top.PronScore ?? top.AccuracyScore),
      accuracy: clamp(top.AccuracyScore),
      fluency: clamp(top.FluencyScore),
      completeness: clamp(top.CompletenessScore),
      recognized: best.Display ?? best.Lexical ?? body.DisplayText ?? "",
      words
    }
  };
}
function createAzureScorer(options) {
  const doFetch = options.fetch ?? fetch;
  return {
    async assess(wav, text, locale) {
      const url = `https://${options.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
      const response = await doFetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": options.key,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
          "Pronunciation-Assessment": assessmentHeader(text, locale)
        },
        body: wav,
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) {
        throw new Error(`Azure pronunciation ${response.status}: ${await response.text()}`);
      }
      return parseAzureAssessment(await response.json());
    }
  };
}

// src/functions/assess-pronunciation/handler.ts
import { z as z2 } from "npm:zod@4.6.5";

// src/lib/pronunciation/api.ts
import { z } from "npm:zod@4.6.5";
var PronunciationLocaleSchema = z.enum(["en-US", "en-GB"]);
var MAX_PRONUNCIATION_AUDIO_BASE64 = 3e5;
var MAX_REFERENCE_CHARS = 60;
var AssessRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_REFERENCE_CHARS),
  locale: PronunciationLocaleSchema,
  audio: z.string().min(1).max(MAX_PRONUNCIATION_AUDIO_BASE64)
});
var score = z.number().min(0).max(100);
var PhonemeScoreSchema = z.object({
  /** Âm vị IPA; null khi dịch vụ không trả tên âm (giọng Anh – Azure chỉ có tên âm cho en-US). */
  ipa: z.string().nullable(),
  score
});
var WordScoreSchema = z.object({
  word: z.string(),
  accuracy: score,
  /** None, Mispronunciation, Omission, Insertion… */
  errorType: z.string(),
  phonemes: z.array(PhonemeScoreSchema)
});
var PronunciationResultSchema = z.object({
  /** Điểm tổng 0–100 (PronScore). */
  overall: score,
  accuracy: score,
  fluency: score,
  completeness: score,
  /** Chữ dịch vụ nghe được. */
  recognized: z.string(),
  words: z.array(WordScoreSchema)
});
var AssessResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), result: PronunciationResultSchema }),
  /** Không nghe thấy tiếng nói (im lặng, quá ồn). */
  z.object({ status: z.literal("no_speech") }),
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  z.object({ status: z.literal("unavailable") })
]);

// src/functions/assess-pronunciation/handler.ts
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
function createAssessHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    let wav;
    try {
      body = AssessRequestSchema.parse(await request.json());
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

// src/functions/assess-pronunciation/main.ts
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
var scorer = azureKey && azureRegion ? createAzureScorer({ key: azureKey, region: azureRegion }) : null;
if (!scorer) console.warn("Chưa có AZURE_SPEECH_KEY/AZURE_SPEECH_REGION: không chấm phát âm.");
Deno.serve(
  createAssessHandler({
    scorer,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "pronunciation"
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data;
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    }
  })
);
