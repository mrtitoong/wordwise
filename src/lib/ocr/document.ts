/**
 * Văn bản đọc được trên ảnh (OCR) ở dạng chung cho cả Google Cloud Vision (có vị trí từng từ) và
 * LLM có thị giác (chỉ có chữ). Hàm thuần, chạy được ở Edge Function và trình duyệt.
 *
 * Toạ độ khung chuẩn hoá về 0–1 theo kích thước ảnh gửi đi (ảnh đã xoay/cắt), nên app vẽ khung
 * bằng phần trăm, không phụ thuộc kích thước hiển thị.
 */
import { z } from "zod";

export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export type Box = z.infer<typeof BoxSchema>;

export const OcrTokenSchema = z.object({
  text: z.string(),
  /** word: có chữ cái hoặc số; punct: dấu câu, ký hiệu. */
  kind: z.enum(["word", "punct"]),
  /** Một từ bị ngắt dòng bằng gạch nối có hai khung; rỗng khi đọc bằng LLM. */
  boxes: z.array(BoxSchema),
  confidence: z.number().nullable(),
  /** Có khoảng trắng (hoặc xuống dòng) trước token. */
  spaceBefore: z.boolean(),
  paragraph: z.number().int(),
  sentence: z.number().int(),
});

export type OcrToken = z.infer<typeof OcrTokenSchema>;

export const OcrDocumentSchema = z.object({
  source: z.enum(["vision", "llm"]),
  tokens: z.array(OcrTokenSchema),
  /** Trung bình độ tin cậy của các từ (Vision); null khi đọc bằng LLM. */
  meanConfidence: z.number().nullable(),
  /** Độ nghiêng của dòng chữ (độ, dương là xoay chiều kim đồng hồ); null khi không đo được. */
  skewDegrees: z.number().nullable(),
});

export type OcrDocument = z.infer<typeof OcrDocumentSchema>;

/** Giới hạn số token trả về (một trang sách dày ~500 từ). */
export const MAX_TOKENS = 2500;

const WORDLIKE = /[\p{L}\p{N}]/u;
const SENTENCE_END = /^[.!?…]+$|^[.!?]["'”’)]$/;
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "vs",
  "prof",
  "inc",
  "jr",
  "sr",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "vol",
  "p",
  "pp",
]);

export function tokenKind(text: string): OcrToken["kind"] {
  return WORDLIKE.test(text) ? "word" : "punct";
}

/** Token thô trước khi chia câu. */
export type RawToken = Omit<OcrToken, "sentence">;

/**
 * Đánh số câu: câu kết thúc ở dấu . ! ? (khi chữ sau viết hoa, là số hoặc dấu mở ngoặc) và ở cuối
 * đoạn. Không ngắt sau chữ viết tắt thường gặp (Mr., e.g.).
 */
export function assignSentences(tokens: readonly RawToken[]): OcrToken[] {
  const out: OcrToken[] = [];
  let sentence = 0;
  for (const [i, token] of tokens.entries()) {
    const prev = out[i - 1];
    if (prev && token.paragraph !== prev.paragraph) sentence++;
    else if (prev && SENTENCE_END.test(prev.text) && startsSentence(token)) {
      const before = tokens[i - 2];
      const abbreviation =
        prev.text === "." &&
        before?.kind === "word" &&
        !prev.spaceBefore &&
        ABBREVIATIONS.has(before.text.toLowerCase());
      if (!abbreviation) sentence++;
    }
    out.push({ ...token, sentence });
  }
  return out;
}

function startsSentence(token: RawToken): boolean {
  return /^[\p{Lu}\p{N}"'“‘(]/u.test(token.text);
}

/** Ghép token lại thành chuỗi theo khoảng trắng gốc. */
export function joinTokens(tokens: readonly Pick<OcrToken, "text" | "spaceBefore">[]): string {
  return tokens.map((t, i) => (i > 0 && t.spaceBefore ? " " : "") + t.text).join("");
}

/**
 * Câu chứa các token [from, to] (chỉ số trong doc.tokens). Câu quá dài (OCR không thấy dấu chấm)
 * thì lấy một khúc quanh từ đó, tối đa maxLength ký tự.
 */
export function sentenceAround(
  doc: Pick<OcrDocument, "tokens">,
  from: number,
  to = from,
  maxLength = 300,
): string {
  const sentence = doc.tokens[from]?.sentence;
  if (sentence === undefined) return "";
  let start = from;
  let end = to;
  while (start > 0 && doc.tokens[start - 1]!.sentence === sentence) start--;
  while (end < doc.tokens.length - 1 && doc.tokens[end + 1]!.sentence === sentence) end++;
  const full = joinTokens(doc.tokens.slice(start, end + 1));
  if (full.length <= maxLength) return full;

  // Mở rộng dần hai bên quanh từ đã chọn cho tới khi chạm giới hạn.
  let left = from;
  let right = to;
  const length = () => joinTokens(doc.tokens.slice(left, right + 1)).length;
  for (let grew = true; grew;) {
    grew = false;
    if (left > start) {
      left--;
      if (length() > maxLength) left++;
      else grew = true;
    }
    if (right < end) {
      right++;
      if (length() > maxLength) right--;
      else grew = true;
    }
  }
  const text = joinTokens(doc.tokens.slice(left, right + 1));
  return `${left > start ? "…" : ""}${text}${right < end ? "…" : ""}`;
}

/** Số từ (không tính dấu câu). */
export function wordCount(doc: Pick<OcrDocument, "tokens">): number {
  return doc.tokens.filter((t) => t.kind === "word").length;
}

/**
 * Văn bản thuần (LLM có thị giác, bài viết ở tab Link) → tài liệu OCR không có khung. Dòng trống
 * ngăn cách đoạn; từ bị ngắt cuối dòng bằng gạch nối được nối lại ("resil-\nient" → "resilient").
 */
export function documentFromText(text: string, maxTokens = MAX_TOKENS): OcrDocument {
  const paragraphs = text
    .replaceAll("\r\n", "\n")
    .replace(/(\p{L})-\n[ \t]*(\p{Ll})/gu, "$1$2")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const raw: RawToken[] = [];
  for (const [paragraph, body] of paragraphs.entries()) {
    const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*|[^\s\p{L}\p{N}]/gu;
    let last = 0;
    for (const match of body.matchAll(pattern)) {
      const gap = body.slice(last, match.index);
      raw.push({
        text: match[0],
        kind: tokenKind(match[0]),
        boxes: [],
        confidence: null,
        spaceBefore: raw.length > 0 && (gap.length > 0 || match.index === 0),
        paragraph,
      });
      last = match.index + match[0].length;
      if (raw.length >= maxTokens) break;
    }
    if (raw.length >= maxTokens) break;
  }
  return {
    source: "llm",
    tokens: assignSentences(raw),
    meanConfidence: null,
    skewDegrees: null,
  };
}
