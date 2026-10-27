"use client";

import { cachedSentenceAudioUrl } from "@/features/offline/media-cache";
import type { Voice } from "@/lib/media/tts-azure";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Audio câu ví dụ: đã có trên máy thì dùng luôn (cả khi offline); chưa có thì xin máy chủ (tạo khi
 * cần, trong giới hạn ngày); không được thì null. Phần gọi máy chủ (Supabase, Zod) chỉ tải lúc cần.
 */
export async function sentenceAudioUrl(
  senseId: string,
  index: number,
  voice: Voice,
  sentence: string,
): Promise<string | null> {
  const cached = await cachedSentenceAudioUrl(sentence, voice);
  if (cached) return cached;
  if (!getSupabaseEnv()) return null;
  const [{ createClient }, { requestSentenceAudioUrl }] = await Promise.all([
    import("@/lib/supabase/client"),
    import("@/lib/media/request-sentence-audio"),
  ]);
  return requestSentenceAudioUrl(createClient(), { senseId, index, voice });
}
