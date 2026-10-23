"use client";

/**
 * Đọc file bảng (CSV, Excel .xlsx) trong trình duyệt: tab File của Thêm từ (Prompt 2.4b) và nguồn
 * từ của danh sách Admin (Prompt 7.1). File không gửi lên máy chủ.
 */

export type Table = { name: string; rows: string[][] };

const cellText = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);

/** Đọc file .xlsx (mọi trang tính) hoặc CSV thành bảng chữ. */
export async function readTableFile(file: File): Promise<Table[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((r) => r.map(cellText)) }));
  }
  const Papa = (await import("papaparse")).default;
  const rows = await new Promise<string[][]>((resolve, reject) =>
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => resolve(result.data),
      error: reject,
    }),
  );
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return [{ name: file.name, rows }];
}

/** Tên cột kiểu bảng tính: A, B, …, Z, AA… */
export const columnName = (i: number) =>
  i < 26
    ? String.fromCharCode(65 + i)
    : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
