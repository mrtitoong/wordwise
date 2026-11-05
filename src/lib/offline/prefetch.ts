/**
 * Tải trước audio (và ảnh) của thẻ đến hạn tới hết ngày mai, để ôn offline vẫn nghe được. Hàm thuần;
 * phần chạy ở src/features/offline/prefetch-runner.ts.
 *
 * - Audio của từ: chỉ giọng đang chọn (~10 KB/file). Audio câu ví dụ: chỉ câu đã có file (tải thử,
 *   chưa có thì bỏ qua – không tạo audio mới nên không tốn tiền).
 * - Ảnh (~100 KB/ảnh): chỉ khi chắc chắn đang dùng Wi-Fi/mạng dây.
 * - Không tải khi offline hoặc máy bật "Tiết kiệm dữ liệu".
 */
import { languageVoice, languagePack } from "@/lib/lang";
import { learningLanguage } from "@/lib/lang/filter";
import type { Voice } from "@/lib/media/tts-azure";
import { addDays, studyDay } from "@/lib/review/day";
import { hanziParts, strokeDataUrl } from "@/lib/review/hanzi";
import type { Language } from "@/lib/schema/word";

/** Tối đa số file mỗi lần tải trước. */
export const PREFETCH_MAX_FILES = 300;
/** Câu ví dụ mỗi nghĩa được tải audio (thẻ từ hiện tối đa ngần ấy câu trước khi bấm "Xem thêm"). */
export const PREFETCH_EXAMPLES_PER_SENSE = 2;

export type ConnectionInfo = {
  online: boolean;
  /** navigator.connection.saveData */
  saveData?: boolean;
  /** navigator.connection.type ("wifi", "cellular", …); iPhone/Safari không có. */
  type?: string;
};

export type PrefetchPolicy = { strokes: boolean; audio: boolean; images: boolean };

export function prefetchPolicy(connection: ConnectionInfo): PrefetchPolicy {
  if (!connection.online || connection.saveData) {
    return { strokes: false, audio: false, images: false };
  }
  if (connection.type === "wifi" || connection.type === "ethernet") {
    return { strokes: true, audio: true, images: true };
  }
  // Dữ liệu nét ~1 KB/chữ nên tải cả khi dùng 4G; thiếu thì không viết được khi offline.
  if (connection.type === "cellular" || connection.type === "bluetooth") {
    return { strokes: true, audio: false, images: false };
  }
  // Không biết loại mạng (iPhone, máy tính): chỉ audio (nhỏ).
  return { strokes: true, audio: true, images: false };
}

type CardLike = { user_word_id: string; due: string; deleted_at: string | null };
type UserWordLike = { id: string; sense_id: string; status: string; deleted_at: string | null };

/** Nghĩa (sense_id) có thẻ đến hạn tới hết ngày học mai (ngày học bắt đầu 4:00). */
export function senseIdsDueBy(
  cards: readonly CardLike[],
  userWords: readonly UserWordLike[],
  now: Date,
  timeZone: string,
): string[] {
  const lastDay = addDays(studyDay(now, timeZone), 1);
  const words = new Map(userWords.map((u) => [u.id, u]));
  const senses = new Set<string>();
  for (const card of cards) {
    if (card.deleted_at) continue;
    const word = words.get(card.user_word_id);
    if (!word || word.deleted_at || word.status === "suspended" || word.status === "queued") {
      continue;
    }
    if (studyDay(new Date(card.due), timeZone) <= lastDay) senses.add(word.sense_id);
  }
  return [...senses];
}

export type MediaSource = {
  word: {
    lemma: string;
    language: string;
    audio_us_url: string | null;
    audio_uk_url: string | null;
  };
  sense: { image_url: string | null };
  examples: readonly { sentence: string }[];
};

export type PrefetchItem =
  | { kind: "audio"; url: string }
  | { kind: "sentence"; sentence: string; language: Language; voice: Voice }
  | { kind: "strokes"; url: string }
  | { kind: "image"; url: string };

/** Danh sách file cần tải (bỏ trùng, tối đa PREFETCH_MAX_FILES): nét chữ, audio rồi tới ảnh. */
export function prefetchItems(
  sources: readonly MediaSource[],
  voice: "us" | "uk",
  policy: PrefetchPolicy,
): PrefetchItem[] {
  const strokes: PrefetchItem[] = [];
  const audio: PrefetchItem[] = [];
  const images: PrefetchItem[] = [];
  const seen = new Set<string>();
  const add = (list: PrefetchItem[], item: PrefetchItem, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    list.push(item);
  };
  for (const source of sources) {
    const language = learningLanguage(source.word.language);
    if (policy.strokes && languagePack(language).writesStrokes) {
      for (const { char, write } of hanziParts(source.word.lemma)) {
        if (write) add(strokes, { kind: "strokes", url: strokeDataUrl(char) }, strokeDataUrl(char));
      }
    }
    if (policy.audio) {
      const wordVoice = languageVoice(language, voice);
      const url = wordVoice === "uk" ? source.word.audio_uk_url : source.word.audio_us_url;
      if (url) add(audio, { kind: "audio", url }, url);
      for (const example of source.examples.slice(0, PREFETCH_EXAMPLES_PER_SENSE)) {
        add(
          audio,
          { kind: "sentence", sentence: example.sentence, language, voice: wordVoice },
          `s:${example.sentence}`,
        );
      }
    }
    if (policy.images && source.sense.image_url) {
      add(images, { kind: "image", url: source.sense.image_url }, source.sense.image_url);
    }
  }
  return [...strokes, ...audio, ...images].slice(0, PREFETCH_MAX_FILES);
}
