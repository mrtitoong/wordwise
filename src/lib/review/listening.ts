/**
 * Tập nghe (Prompt 4.3): chọn dạng câu hỏi cho thẻ Chính tả, chọn giọng, đếm lượt nghe lại. Hàm
 * thuần, ngẫu nhiên truyền vào để test được.
 *
 * Ba dạng (chốt GĐ4): nghe → chọn nghĩa (thẻ Nghĩa, mức 1 trở lên, trộn với trắc nghiệm); nghe →
 * gõ lại từ (thẻ Chính tả mức 2–3); nghe câu ví dụ → điền từ còn thiếu (thẻ Chính tả mức 3–4).
 * Không phát được âm thanh thì bỏ dạng nghe cho thẻ đó.
 */
import type { Voice } from "@/lib/media/tts-azure";
import type { MasteryLevel } from "@/lib/srs/mastery";

export type SpellingTaskKind = "writing" | "listen-type" | "listen-cloze";

/** Nghe lại quá chừng này lần (không tính lần tự phát) thì tính là đã dùng gợi ý. */
export const FREE_REPLAYS = 3;

export type ListenAvailability = {
  /** Phát được từ: có file MP3 hoặc trình duyệt đọc được. */
  word: boolean;
  /** Có câu ví dụ khuyết được từ và phát được câu. */
  sentence: boolean;
};

/** Dạng câu hỏi cho thẻ Chính tả theo mức thuộc; dạng nghe chỉ khi phát được âm thanh. */
export function spellingTaskKind(
  level: MasteryLevel,
  can: ListenAvailability,
  random: () => number = Math.random,
): SpellingTaskKind {
  const options: SpellingTaskKind[] = ["writing"];
  if (can.word && (level === 2 || level === 3)) options.push("listen-type");
  if (can.sentence && level >= 3) options.push("listen-cloze");
  return options[Math.floor(random() * options.length)]!;
}

/** Giọng cho câu nghe: giọng trong Cài đặt, hoặc ngẫu nhiên Mỹ/Anh khi bật "Luyện nhiều giọng". */
export function listeningVoice(
  preferred: Voice,
  multiAccent: boolean,
  random: () => number = Math.random,
): Voice {
  if (!multiAccent) return preferred;
  return random() < 0.5 ? "us" : "uk";
}

/** Nghe lại nhiều lần coi như dùng gợi ý (chấm tối đa Khó). */
export function replaysAsHint(replays: number): boolean {
  return replays > FREE_REPLAYS;
}
