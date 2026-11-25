"use client";

import { cachedSentenceAudioUrl } from "@/features/offline/media-cache";
import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * URL đã xin trong lần mở app này (kể cả đang chờ): câu hỏi nghe và màn kết quả cùng phát một câu
 * thì chỉ hỏi máy chủ một lần, màn kết quả phát được ngay.
 */
const known = new Map<string, Promise<string | null>>();

/**
 * Audio câu ví dụ: đã có trên máy thì dùng luôn (cả khi offline); chưa có thì xin máy chủ (tạo khi
 * cần, trong giới hạn ngày); không được thì null. Phần gọi máy chủ (Supabase, Zod) chỉ tải lúc cần.
 */
export function sentenceAudioUrl(
  senseId: string,
  index: number,
  voice: Voice,
  sentence: string,
  language?: Language,
): Promise<string | null> {
  const key = JSON.stringify([senseId, index, voice, sentence, language ?? null]);
  let url = known.get(key);
  if (!url) {
    url = fetchSentenceAudioUrl(senseId, index, voice, sentence, language);
    known.set(key, url);
    // Không được (mất mạng, hết lượt) thì lần sau xin lại.
    void url.then(
      (value) => value === null && known.delete(key),
      () => known.delete(key),
    );
  }
  return url;
}

async function fetchSentenceAudioUrl(
  senseId: string,
  index: number,
  voice: Voice,
  sentence: string,
  language?: Language,
): Promise<string | null> {
  const cached = await cachedSentenceAudioUrl(sentence, voice, language);
  if (cached) return cached;
  if (!getSupabaseEnv()) return null;
  const [{ createClient }, { requestSentenceAudioUrl }] = await Promise.all([
    import("@/lib/supabase/client"),
    import("@/lib/media/request-sentence-audio"),
  ]);
  return requestSentenceAudioUrl(createClient(), { senseId, index, voice });
}
