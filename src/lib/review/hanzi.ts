/**
 * Viết chữ Hán (chốt Z3): thẻ Chính tả của tiếng Trung viết lần lượt từng chữ của từ, đúng thứ tự nét.
 * Hàm thuần; phần vẽ ở src/features/review/modes/hanzi-writing.tsx.
 *
 * Không tính thời gian (viết tay lâu là bình thường), điểm cao nhất là "Nhớ":
 * - không sai nét, không gợi ý → Nhớ;
 * - sai tối đa 20% số nét (ít nhất được sai 1 nét) hoặc có gợi ý → Khó;
 * - sai nhiều hơn hoặc bấm "Không nhớ" → Quên.
 */
import type { MasteryLevel } from "@/lib/srs/mastery";

/** Phần số nét được sai mà vẫn tính là nhớ: nét đúng vẫn có khi bị từ chối oan (5–11% khi viết lệch). */
export const ALLOWED_MISTAKE_RATIO = 0.2;
/** Độ dễ của Hanzi Writer: giữ mặc định, máy thật nhận 63/63 nét viết đúng (docs/zh-spike.md §2). */
export const STROKE_LENIENCY = 1;
/** Sai liên tiếp chừng này lần ở một nét thì tự hiện nét đó, để không bị kẹt. */
export const HINT_AFTER_MISSES = 3;
/** Nét mờ hiện ở mức thuộc này trở xuống; cao hơn phải tự nhớ. */
export const OUTLINE_MAX_LEVEL = 2;

const HAN = /\p{Script=Han}/u;

export type HanziPart = { char: string; write: boolean };

/** Các ký tự của từ; chỉ chữ Hán phải viết (T恤, 卡拉OK có chữ cái). */
export function hanziParts(lemma: string): HanziPart[] {
  return Array.from(lemma.trim()).map((char) => ({ char, write: HAN.test(char) }));
}

/** Đường dẫn dữ liệu nét của một chữ (`npm run hanzi:copy` chép vào public/hanzi). */
export function strokeDataUrl(char: string): string {
  return `/hanzi/${encodeURIComponent(char)}.json`;
}

export function showsOutline(level: MasteryLevel): boolean {
  return level <= OUTLINE_MAX_LEVEL;
}

export function allowedMistakes(strokes: number): number {
  return Math.max(1, Math.floor(strokes * ALLOWED_MISTAKE_RATIO));
}

/** Kết quả cả từ, theo tổng số nét, số lần sai và số lần bấm gợi ý. */
export function hanziResult({
  strokes,
  mistakes,
  hints,
}: {
  strokes: number;
  mistakes: number;
  hints: number;
}): { correct: boolean; usedHint: boolean } {
  return {
    correct: mistakes <= allowedMistakes(strokes),
    usedHint: hints > 0 || mistakes > 0,
  };
}
