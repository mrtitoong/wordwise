/**
 * Đường dẫn file audio trong bucket "audio". Hàm thuần, chạy ở Node, Deno và trình duyệt.
 *   Từ:  en/{từ}/{loại từ}/{us|uk}.mp3   (vd en/give_up/phrasal_verb/us.mp3)
 *   Câu: en/sentences/{sha-256 của giọng + câu, 32 ký tự}.mp3
 * Câu theo mã băm nên sửa câu ví dụ thì tự ra file mới, không phát nhầm audio cũ.
 */
import type { Language, Pos } from "@/lib/schema/word";
import type { Voice } from "./tts-azure";

export const AUDIO_BUCKET = "audio";

/** Chữ thường, chỉ a-z 0-9 và "-"; ký tự khác (dấu cách, nháy) thành "_". */
export function slugifyLemma(lemma: string): string {
  const slug = lemma
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "_";
}

export function wordAudioPath(language: Language, lemma: string, pos: Pos, voice: Voice): string {
  return `${language}/${slugifyLemma(lemma)}/${pos}/${voice}.mp3`;
}

export async function sentenceAudioPath(
  language: Language,
  sentence: string,
  voice: Voice,
): Promise<string> {
  const bytes = new TextEncoder().encode(`${voice}\n${sentence.trim()}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${language}/sentences/${hex.slice(0, 32)}.mp3`;
}

export function publicAudioUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${AUDIO_BUCKET}/${path}`;
}
