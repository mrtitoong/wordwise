/**
 * Nhập từ file CSV/Excel (Prompt 2.4b). File chỉ là danh sách từ muốn học và cách gom nhóm (tag):
 * nội dung từ luôn lấy từ kho; cột nghĩa/ghi chú thành ghi chú riêng của người dùng, và cột
 * nghĩa giúp chọn đúng nghĩa trong kho. Hàm thuần; đọc file (papaparse, read-excel-file) ở
 * component.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_ROWS = 5000;
export const MAX_TAGS = 10;

export const IMPORT_FIELDS = ["word", "meaning", "example", "note", "tags"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/** Cột → trường; null = bỏ qua cột đó. */
export type ColumnMapping = (ImportField | null)[];

/** Bỏ dấu tiếng Việt, hoa thường, ký tự lạ (để so tên cột và so nghĩa). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const HEADER_NAMES: Record<ImportField, string[]> = {
  word: [
    "word",
    "words",
    "tu",
    "tu vung",
    "vocabulary",
    "vocab",
    "term",
    "english",
    "tieng anh",
    "front",
  ],
  meaning: [
    "meaning",
    "nghia",
    "definition",
    "dich",
    "translation",
    "vietnamese",
    "tieng viet",
    "back",
  ],
  example: ["example", "examples", "vi du", "cau", "cau vi du", "sentence", "context", "ngu canh"],
  note: ["note", "notes", "ghi chu", "comment", "chu thich"],
  tags: ["tag", "tags", "nhom", "chu de", "topic", "category", "label", "deck"],
};

/** Đoán cột theo tiêu đề; không đoán được thì cột đầu là từ, cột hai là nghĩa. */
export function detectColumns(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = headers.map(() => null);
  const used = new Set<ImportField>();
  headers.forEach((header, i) => {
    const key = fold(header);
    const field = IMPORT_FIELDS.find((f) => !used.has(f) && HEADER_NAMES[f].includes(key));
    if (field) {
      mapping[i] = field;
      used.add(field);
    }
  });
  if (!used.has("word") && headers.length > 0) {
    mapping[0] = "word";
    used.add("word");
    if (headers.length > 1 && mapping[1] === null && !used.has("meaning")) mapping[1] = "meaning";
  }
  return mapping;
}

/** Dòng đầu có phải tiêu đề không (có ít nhất một tên cột quen thuộc). */
export function looksLikeHeader(row: readonly string[]): boolean {
  return row.some((cell) => IMPORT_FIELDS.some((f) => HEADER_NAMES[f].includes(fold(cell))));
}

export type RowError = "missing_word" | "too_long" | "not_a_word";

export type ImportRow = {
  /** Số dòng trong file (bắt đầu từ 1, tính cả dòng tiêu đề) để báo lỗi. */
  line: number;
  word: string;
  meaning: string | null;
  example: string | null;
  note: string | null;
  tags: string[];
  error: RowError | null;
  /** Trùng một dòng phía trên trong cùng file. */
  duplicateOf: number | null;
};

const clean = (value: unknown, max: number): string | null => {
  const text = value === null || value === undefined ? "" : String(value);
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export function splitTags(value: string | null): string[] {
  if (!value) return [];
  const tags = value
    .split(/[,;|#]+/)
    .map((t) => t.trim().toLowerCase().slice(0, 30))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

/** Đọc các dòng theo ánh xạ cột, đánh dấu dòng lỗi và dòng trùng. Bỏ dòng trống hoàn toàn. */
export function readRows(
  table: readonly (readonly unknown[])[],
  mapping: ColumnMapping,
  hasHeader: boolean,
): ImportRow[] {
  const col = (field: ImportField) => mapping.indexOf(field);
  const rows: ImportRow[] = [];
  const firstLine = new Map<string, number>();
  table.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + MAX_FILE_ROWS).forEach((cells, i) => {
    if (cells.every((c) => clean(c, 1) === null)) return;
    const line = i + (hasHeader ? 2 : 1);
    const get = (field: ImportField, max: number) =>
      col(field) >= 0 ? clean(cells[col(field)], max) : null;
    const raw = col("word") >= 0 ? clean(cells[col("word")], 200) : null;
    let error: RowError | null = null;
    if (!raw) error = "missing_word";
    else if (raw.length > 64) error = "too_long";
    else if (!/\p{L}/u.test(raw)) error = "not_a_word";
    const word = raw ? raw.slice(0, 64) : "";
    const key = word.toLowerCase();
    const duplicateOf = !error && firstLine.has(key) ? firstLine.get(key)! : null;
    if (!error && duplicateOf === null) firstLine.set(key, line);
    rows.push({
      line,
      word,
      meaning: get("meaning", 500),
      example: get("example", 500),
      note: get("note", 500),
      tags: splitTags(get("tags", 300)),
      error,
      duplicateOf,
    });
  });
  return rows;
}

/** Ghi chú riêng lưu cho từ: nghĩa người dùng ghi + ghi chú (nếu có). */
export function personalNote(row: Pick<ImportRow, "meaning" | "note">): string | null {
  const parts = [row.meaning, row.note].filter((p): p is string => !!p);
  return parts.length ? parts.join(" · ").slice(0, 500) : null;
}

/**
 * Chọn nghĩa trong kho khớp nhất với nghĩa người dùng ghi (so từ chung sau khi bỏ dấu).
 * Không có nghĩa hoặc không khớp chút nào → null (dùng nghĩa phổ biến nhất).
 */
export function bestSenseByMeaning(
  options: readonly { senseId: string; meaning: string }[],
  meaning: string | null,
): string | null {
  if (!meaning) return null;
  const wanted = new Set(
    fold(meaning)
      .split(" ")
      .filter((w) => w.length > 0),
  );
  if (wanted.size === 0) return null;
  let best: { senseId: string; score: number } | null = null;
  for (const option of options) {
    const words = new Set(fold(option.meaning).split(" ").filter(Boolean));
    let common = 0;
    for (const w of wanted) if (words.has(w)) common++;
    const score = common / Math.max(wanted.size, 1);
    if (score > 0 && (!best || score > best.score)) best = { senseId: option.senseId, score };
  }
  return best?.senseId ?? null;
}
