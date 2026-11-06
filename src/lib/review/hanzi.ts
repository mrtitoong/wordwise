/**
 * Viết chữ Hán (chốt Z3): thẻ Chính tả của tiếng Trung viết lần lượt từng chữ của từ, đúng thứ tự nét.
 * Hàm thuần; phần vẽ ở src/features/review/modes/hanzi-writing.tsx.
 *
 * Không tính thời gian (viết tay lâu là bình thường), điểm cao nhất là "Nhớ":
 * - không sai nét, không gợi ý → Nhớ;
 * - sai tối đa 20% số nét (ít nhất được sai 1 nét) hoặc có gợi ý → Khó;
 * - sai nhiều hơn hoặc bấm "Không nhớ" → Quên.
 * Đếm theo nét, không theo số lần thử: thử lại một nét nhiều lần chỉ tính một nét sai.
 */
import type { MasteryLevel } from "@/lib/srs/mastery";

/** Phần số nét được sai mà vẫn tính là nhớ: nét đúng vẫn có khi bị từ chối oan (5–11% khi viết lệch). */
export const ALLOWED_MISTAKE_RATIO = 0.2;
/**
 * Độ dễ của Hanzi Writer. Mặc định 1 từ chối oan nét hơi lệch của người mới học trên iPhone
 * (docs/qa/zh-iphone.md); 1,5 nhận nét lệch 17 px 95% thay vì 89%, nhận nhầm ~2% nét sai thứ tự.
 */
export const STROKE_LENIENCY = 1.5;
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

export type StrokeMiss = { part: number; stroke: number };

/** Số nét khác nhau đã viết sai trong cả từ (`part`: thứ tự chữ, `stroke`: thứ tự nét). */
export function missedStrokes(misses: readonly StrokeMiss[]): number {
  return new Set(misses.map(({ part, stroke }) => `${part}:${stroke}`)).size;
}

/** Kết quả cả từ, theo tổng số nét, số nét sai và số lần bấm gợi ý. */
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
