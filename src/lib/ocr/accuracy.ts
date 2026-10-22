/**
 * Đo độ chính xác OCR theo từ (docs/qa/ocr.md): so dãy từ đọc được với chữ đúng bằng dãy con
 * chung dài nhất (LCS), không phân biệt hoa thường, bỏ dấu câu.
 */
import { joinTokens, type OcrDocument } from "./document";

export function wordsOf(text: string): string[] {
  return (
    text
      .normalize("NFC")
      .replace(/[’‘]/g, "'")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? []
  );
}

function lcsLength(a: readonly string[], b: readonly string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 0; j < b.length; j++) {
      row[j + 1] = x === b[j] ? prev[j]! + 1 : Math.max(prev[j + 1]!, row[j]!);
    }
    prev = row;
  }
  return prev[b.length]!;
}

export type Accuracy = {
  /** Số từ trong chữ đúng. */
  expected: number;
  /** Số từ đọc được. */
  read: number;
  /** Số từ đúng (đúng thứ tự). */
  matched: number;
  /** matched / expected. */
  recall: number;
  /** matched / read (từ thừa, đọc sai làm giảm). */
  precision: number;
};

export function wordAccuracy(expectedText: string, readText: string): Accuracy {
  const expected = wordsOf(expectedText);
  const read = wordsOf(readText);
  const matched = lcsLength(expected, read);
  return {
    expected: expected.length,
    read: read.length,
    matched,
    recall: expected.length ? matched / expected.length : 1,
    precision: read.length ? matched / read.length : expected.length ? 0 : 1,
  };
}

export function documentText(doc: OcrDocument): string {
  return joinTokens(doc.tokens);
}
