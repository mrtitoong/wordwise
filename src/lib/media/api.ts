/**
 * Hợp đồng của Edge Function word-media, dùng chung cho máy chủ và app.
 */
import { z } from "zod";

export const VoiceSchema = z.enum(["us", "uk"]);

/** Xin audio cho một câu ví dụ: máy chủ tự lấy nội dung câu từ kho (không nhận văn bản tùy ý). */
export const SentenceAudioRequestSchema = z.object({
  action: z.literal("sentence"),
  senseId: z.uuid(),
  /** Vị trí câu trong word_details.examples của nghĩa đó. */
  index: z.number().int().min(0).max(9),
  voice: VoiceSchema,
});

export const MediaWorkerRequestSchema = z.object({ action: z.literal("work") });

export const MediaFunctionRequestSchema = z.discriminatedUnion("action", [
  SentenceAudioRequestSchema,
  MediaWorkerRequestSchema,
]);

export type SentenceAudioRequest = z.infer<typeof SentenceAudioRequestSchema>;

export const SentenceAudioResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), url: z.url() }),
  /** Khách chưa đăng nhập và câu chưa có audio: app đọc bằng giọng của trình duyệt. */
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** TTS chưa cấu hình hoặc tạm lỗi: app đọc bằng giọng của trình duyệt. */
  z.object({ status: z.literal("unavailable") }),
  z.object({ status: z.literal("not_found") }),
]);

export type SentenceAudioResponse = z.infer<typeof SentenceAudioResponseSchema>;
