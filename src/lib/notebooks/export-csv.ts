/**
 * Xuất sổ tay ra CSV (mở được bằng Excel, Google Sheets; nhập lại được vào WordWise).
 * Hàm thuần.
 */
import type { LearningStatus } from "./progress";

export type ExportRow = {
  word: string;
  pos: string;
  meaning: string;
  example: string | null;
  note: string | null;
  tags: string[];
  status: LearningStatus;
  addedAt: string;
};

export const EXPORT_HEADERS = [
  "word",
  "pos",
  "meaning",
  "example",
  "note",
  "tags",
  "status",
  "added_at",
] as const;

/** Ô CSV theo RFC 4180; chặn công thức Excel (=, +, -, @ ở đầu) để tránh chèn công thức. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Nội dung file: có BOM để Excel đọc đúng tiếng Việt, xuống dòng CRLF. */
export function buildCsv(rows: readonly ExportRow[]): string {
  const lines = [EXPORT_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.word,
        row.pos,
        row.meaning,
        row.example,
        row.note,
        row.tags.join(", "),
        row.status,
        row.addedAt.slice(0, 10),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/** Tên file an toàn từ tên sổ (giữ tiếng Việt, bỏ ký tự cấm trên Windows). */
export function exportFileName(notebookName: string, date: Date): string {
  const base =
    notebookName
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "so-tay";
  return `${base.slice(0, 80)} ${date.toISOString().slice(0, 10)}.csv`;
}
