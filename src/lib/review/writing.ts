/**
 * Tập viết (Prompt 4.2): chọn cấp gợi ý, xáo chữ, che chữ, câu ví dụ khuyết từ. Hàm thuần, ngẫu
 * nhiên truyền vào để test được.
 *
 * Cấp (chốt GĐ4): 1 xếp chữ · 2 điền chữ thiếu (c_ll_c_t_on) · 3 chữ đầu + số ô · 4 ô trống.
 * Thẻ Chính tả mức 0–1 ngẫu nhiên cấp 1 hoặc 2 (đúng tối đa "Nhớ"), mức 2 cấp 3, mức 3–4 cấp 4.
 * "Gợi ý" hạ một cấp; ở cấp 1 thì đặt sẵn chữ kế tiếp.
 */
import { Rating, type Grade } from "ts-fsrs";
import type { MasteryLevel } from "@/lib/srs/mastery";

export type WritingLevel = 1 | 2 | 3 | 4;

/** Phần chữ của đáp án: chữ cái phải viết, hoặc ký tự cố định (khoảng trắng, gạch nối, nháy). */
export type Slot = { char: string; fixed: boolean };

/** Ẩn khoảng chừng này phần chữ cái ở cấp 2. */
export const MASK_RATIO = 0.4;
/** Cấp gợi ý tối đa ghi vào review_logs.hint_level. */
export const MAX_HINT_LEVEL = 4;

const FIXED = /[\s'’-]/u;

export function startLevel(
  mastery: MasteryLevel,
  random: () => number = Math.random,
): WritingLevel {
  if (mastery <= 1) return random() < 0.5 ? 1 : 2;
  return mastery === 2 ? 3 : 4;
}

/** Cấp dễ (xếp chữ, điền chữ thiếu) đúng cũng chỉ tối đa "Nhớ". */
export function maxRatingFor(level: WritingLevel): Grade | undefined {
  return level <= 2 ? Rating.Good : undefined;
}

export function slotsOf(target: string): Slot[] {
  return Array.from(target.trim()).map((char) => ({ char, fixed: FIXED.test(char) }));
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Ô chữ cái cho cấp 1: chữ cái của đáp án (chữ thường) xáo trộn, khác thứ tự đúng nếu được. */
export function scrambleTiles(target: string, random: () => number = Math.random): string[] {
  const letters = slotsOf(target)
    .filter((s) => !s.fixed)
    .map((s) => s.char.toLowerCase());
  if (new Set(letters).size < 2) return letters;
  for (let attempt = 0; attempt < 10; attempt++) {
    const tiles = shuffle(letters, random);
    if (tiles.join("") !== letters.join("")) return tiles;
  }
  return [...letters.slice(1), letters[0]!];
}

/**
 * Cấp 2: vị trí chữ cái bị che (~40%, ít nhất 1). Giữ chữ đầu khi từ có từ 3 chữ cái trở lên để
 * người học nhận ra từ.
 */
export function maskedPositions(target: string, random: () => number = Math.random): Set<number> {
  const slots = slotsOf(target);
  const letters = slots.flatMap((s, i) => (s.fixed ? [] : [i]));
  const candidates = letters.length >= 3 ? letters.slice(1) : letters;
  const count = Math.min(candidates.length, Math.max(1, Math.round(letters.length * MASK_RATIO)));
  return new Set(shuffle(candidates, random).slice(0, count));
}

/** Mẫu hiển thị: cấp 2 che chữ ở `masked`, cấp 3 chỉ hiện chữ đầu; ký tự cố định luôn hiện. */
export function patternOf(
  target: string,
  level: 2 | 3,
  masked: ReadonlySet<number> = new Set(),
): (string | null)[] {
  let firstLetter = true;
  return slotsOf(target).map((slot, i) => {
    if (slot.fixed) return slot.char;
    const show = level === 2 ? !masked.has(i) : firstLetter;
    firstLetter = false;
    return show ? slot.char.toLowerCase() : null;
  });
}

/**
 * Cấp 1: chữ ở ô thứ `index` (trong `tiles`) đặt vào vị trí kế tiếp có đúng không – để "Gợi ý" đặt
 * sẵn chữ kế tiếp. Trả về chỉ số ô còn trống mang chữ cần đặt kế tiếp, hoặc -1.
 */
export function nextTileIndex(
  target: string,
  tiles: readonly string[],
  placed: readonly number[],
): number {
  const letters = slotsOf(target)
    .filter((s) => !s.fixed)
    .map((s) => s.char.toLowerCase());
  // Phần đã đặt sai thì không gợi ý tiếp (người học cần gỡ chữ sai trước).
  for (let i = 0; i < placed.length; i++) if (tiles[placed[i]!] !== letters[i]) return -1;
  const want = letters[placed.length];
  if (want === undefined) return -1;
  return tiles.findIndex((tile, i) => tile === want && !placed.includes(i));
}

/** Ghép ô đã đặt thành chuỗi trả lời, chèn lại ký tự cố định (khoảng trắng của cụm từ). */
export function assemble(target: string, letters: readonly string[]): string {
  let k = 0;
  let out = "";
  for (const slot of slotsOf(target)) {
    if (slot.fixed) out += slot.char;
    else out += letters[k++] ?? "";
  }
  return out;
}

export type Cloze = { before: string; answer: string; after: string };

const LETTER = /\p{L}/u;

/**
 * Câu ví dụ khuyết từ: tìm `highlight` trong câu (không phân biệt hoa/thường, ưu tiên khớp trọn
 * từ). Không tìm thấy thì null.
 */
export function clozeOf(sentence: string, highlight: string): Cloze | null {
  const term = highlight.trim();
  if (!term) return null;
  const lower = sentence.toLowerCase();
  const needle = term.toLowerCase();
  let fallback = -1;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
    const before = sentence[at - 1];
    const after = sentence[at + needle.length];
    const whole = (!before || !LETTER.test(before)) && (!after || !LETTER.test(after));
    if (whole) return cut(sentence, at, needle.length);
    if (fallback < 0) fallback = at;
  }
  return fallback >= 0 ? cut(sentence, fallback, needle.length) : null;
}

function cut(sentence: string, at: number, length: number): Cloze {
  return {
    before: sentence.slice(0, at),
    answer: sentence.slice(at, at + length),
    after: sentence.slice(at + length),
  };
}

/** Đề bài: nghĩa tiếng Việt + loại từ, hoặc (thẻ từ mức 2) câu ví dụ khuyết từ – nửa số lần. */
export function promptKind(
  mastery: MasteryLevel,
  hasCloze: boolean,
  random: () => number = Math.random,
): "meaning" | "cloze" {
  return hasCloze && mastery >= 2 && random() < 0.5 ? "cloze" : "meaning";
}
