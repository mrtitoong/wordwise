/**
 * Audio/ảnh đã lưu trên máy (Service Worker hoặc tải trước, cache CACHE_NAMES.media).
 */
import { DEFAULT_LANGUAGE } from "@/lib/lang";
import { publicAudioUrl, sentenceAudioPath } from "@/lib/media/paths";
import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";
import { CACHE_NAMES } from "@/lib/offline/sw-policy";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** URL công khai của audio một câu (tính từ nội dung câu, không cần hỏi máy chủ). */
export async function sentenceAudioUrl(
  sentence: string,
  voice: Voice,
  language: Language = DEFAULT_LANGUAGE,
): Promise<string | null> {
  const env = getSupabaseEnv();
  return env ? publicAudioUrl(env.url, await sentenceAudioPath(language, sentence, voice)) : null;
}

/** Audio câu đã có trên máy (đã nghe hoặc đã tải trước): phát được cả khi offline. */
export async function cachedSentenceAudioUrl(
  sentence: string,
  voice: Voice,
  language?: Language,
): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  const url = await sentenceAudioUrl(sentence, voice, language);
  if (!url) return null;
  try {
    const cache = await caches.open(CACHE_NAMES.media);
    return (await cache.match(url)) ? url : null;
  } catch {
    return null;
  }
}
