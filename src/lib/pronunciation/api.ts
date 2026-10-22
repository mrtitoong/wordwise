/**
 * Hợp đồng giữa app và Edge Function assess-pronunciation (Prompt 5.2).
 *
 *   POST { text, locale, audio }  – audio là WAV 16 kHz mono (base64), tối đa 5 giây.
 */
import { z } from "zod";

export const PronunciationLocaleSchema = z.enum(["en-US", "en-GB"]);
export type PronunciationLocale = z.infer<typeof PronunciationLocaleSchema>;

/** WAV 16 kHz 16 bit mono 5 giây ≈ 160 KB → base64 ≈ 214 KB; chừa thêm. */
export const MAX_PRONUNCIATION_AUDIO_BASE64 = 300_000;
/** Từ hoặc cụm từ (GĐ5 chưa chấm câu). */
export const MAX_REFERENCE_CHARS = 60;

export const AssessRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_REFERENCE_CHARS),
  locale: PronunciationLocaleSchema,
  audio: z.string().min(1).max(MAX_PRONUNCIATION_AUDIO_BASE64),
});
export type AssessRequest = z.infer<typeof AssessRequestSchema>;

const score = z.number().min(0).max(100);

export const PhonemeScoreSchema = z.object({
  /** Âm vị IPA; null khi dịch vụ không trả tên âm (giọng Anh – Azure chỉ có tên âm cho en-US). */
  ipa: z.string().nullable(),
  score,
});
export type PhonemeScore = z.infer<typeof PhonemeScoreSchema>;

export const WordScoreSchema = z.object({
  word: z.string(),
  accuracy: score,
  /** None, Mispronunciation, Omission, Insertion… */
  errorType: z.string(),
  phonemes: z.array(PhonemeScoreSchema),
});
export type WordScore = z.infer<typeof WordScoreSchema>;

export const PronunciationResultSchema = z.object({
  /** Điểm tổng 0–100 (PronScore). */
  overall: score,
  accuracy: score,
  fluency: score,
  completeness: score,
  /** Chữ dịch vụ nghe được. */
  recognized: z.string(),
  words: z.array(WordScoreSchema),
});
export type PronunciationResult = z.infer<typeof PronunciationResultSchema>;

export const AssessResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), result: PronunciationResultSchema }),
  /** Không nghe thấy tiếng nói (im lặng, quá ồn). */
  z.object({ status: z.literal("no_speech") }),
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  z.object({ status: z.literal("unavailable") }),
]);
export type AssessResponse = z.infer<typeof AssessResponseSchema>;
