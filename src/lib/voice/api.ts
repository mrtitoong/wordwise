/**
 * Hợp đồng Edge Function transcribe (nhận dạng giọng nói qua Azure Speech khi trình duyệt không
 * có Web Speech API). Dùng chung cho máy chủ và app.
 */
import { z } from "zod";

export const SpeechLangSchema = z.enum(["en-US", "en-GB", "vi-VN"]);
export type SpeechLang = z.infer<typeof SpeechLangSchema>;

/** WAV 16 kHz mono 16 bit, tối đa 10 giây ≈ 320 KB ≈ 430 nghìn ký tự base64. */
export const MAX_AUDIO_BASE64 = 450_000;

export const TranscribeRequestSchema = z.object({
  lang: SpeechLangSchema,
  audio: z.string().min(100).max(MAX_AUDIO_BASE64),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

export const TranscribeResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), alternatives: z.array(z.string()).max(5) }),
  /** Không nghe ra chữ nào (im lặng, ồn). */
  z.object({ status: z.literal("no_match") }),
  /** Khách: chỉ dùng được nhận dạng của trình duyệt. */
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** Chưa cấu hình Azure hoặc dịch vụ lỗi. */
  z.object({ status: z.literal("unavailable") }),
]);

export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
