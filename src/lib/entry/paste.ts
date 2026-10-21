/**
 * Đọc danh sách từ người dùng dán vào ô Gõ (mỗi dòng một từ, có thể kèm nghĩa/ghi chú).
 * Hàm thuần.
 */

export const MAX_PASTE_LINES = 200;

export type PastedLine = {
  /** Từ hoặc cụm từ (chưa chuẩn hóa). */
  word: string;
  /** Phần sau dấu phân cách (nghĩa, ghi chú), nếu có. */
  note: string | null;
};

const BULLET = /^\s*(?:[-*•·▪]+|\d{1,4}[.)]|[a-z][.)](?=\s))\s*/i;
// Tab, " - ", " – ", " — ", ":", "=" ngăn từ và ghi chú; dấu "-" dính liền (well-known) giữ nguyên.
const SEPARATOR = /\t|\s+[-–—=]\s+|\s*[:=]\s+|\s*\|\s*/;

export function parsePastedText(text: string): { lines: PastedLine[]; truncated: boolean } {
  const seen = new Set<string>();
  const lines: PastedLine[] = [];
  let truncated = false;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(BULLET, "").trim();
    if (!line) continue;
    const [first = "", ...rest] = line.split(SEPARATOR);
    const word = first.trim();
    const note = rest.join(" ").trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    if (lines.length >= MAX_PASTE_LINES) {
      truncated = true;
      break;
    }
    seen.add(key);
    lines.push({ word, note: note || null });
  }
  return { lines, truncated };
}

/** Có phải người dùng dán nhiều dòng không (để chuyển sang xem trước hàng loạt). */
export function isMultiline(text: string): boolean {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((l) => l.trim()).length > 1
  );
}
