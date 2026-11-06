/**
 * Đọc một mục trong danh sách từ HSK 3.0 (GF 0025-2021, bản chép hsk30). Danh sách ghi loại từ khi
 * một chữ có nhiều mục ("好（形）" cấp 1, "好（副）" cấp 2), nên một mục là chữ + loại từ, không chỉ chữ.
 * Danh sách không nằm trong repo (docs/plan-zh.md §3 điểm 4); xem scripts/zh-hsk-lists.ts.
 */
import type { StoredPos } from "@/lib/schema/word";

const POS: Record<string, StoredPos> = {
  名: "noun",
  动: "verb",
  形: "adjective",
  副: "adverb",
  量: "classifier",
  代: "pronoun",
  介: "preposition",
  连: "conjunction",
  助: "particle",
  数: "numeral",
  叹: "interjection",
};

export type HskEntry = {
  word: string;
  /** Loại từ đầu tiên danh sách ghi; null nếu không ghi. */
  pos: StoredPos | null;
  /** Từ ví dụ cho thấy cách dùng (家（科学家）), giúp chọn đúng nghĩa. */
  example: string | null;
};

const PARENS = /（([^）]*)）/;

/**
 * - "爸爸｜爸": lấy dạng đầu.
 * - "好（形）", "分（名、量）": loại từ.
 * - "家（科学家）": từ ví dụ.
 * - "有（一）些", "好（不）容易": phần có thể bỏ, bỏ đi.
 * - "茅台（酒）": phần có thể thêm ở cuối, ghép vào.
 * - "称¹", "…极了": bỏ số phân biệt và dấu ba chấm.
 */
export function parseHskEntry(raw: string): HskEntry | null {
  const text = raw
    .split("｜")[0]!
    .replace(/[¹²³…]/g, "")
    .trim();
  const match = PARENS.exec(text);
  const inside = match?.[1] ?? "";
  const before = match ? text.slice(0, match.index) : text;
  const after = match ? text.slice(match.index + match[0].length) : "";

  if (!match) return text ? { word: text, pos: null, example: null } : null;
  const parts = inside.split("、");
  if (parts.every((p) => POS[p])) {
    return { word: before + after, pos: POS[parts[0]!]!, example: null };
  }
  if (after) return { word: before + after, pos: null, example: null };
  if (inside.includes(before)) return { word: before, pos: null, example: inside };
  return { word: before + inside, pos: null, example: null };
}

/** Các dòng "số chữ" của danh sách, theo cấp 1–3. */
export function parseHskList(text: string): (HskEntry & { level: number })[] {
  const headings: Record<string, number> = { 一级词汇表: 1, 二级词汇表: 2, 三级词汇表: 3 };
  const entries: (HskEntry & { level: number })[] = [];
  let level = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith("词汇表")) {
      level = headings[line] ?? 0;
      continue;
    }
    const match = /^\d+\s+(.+)$/.exec(line);
    const entry = level > 0 && match ? parseHskEntry(match[1]!) : null;
    if (entry) entries.push({ ...entry, level });
  }
  return entries;
}
