/**
 * Gợi ý từ có thể chưa biết trong bài viết (tab Link). Cùng quy tắc "Tự chọn từ mới" của tab Ảnh
 * (autoPick: bỏ từ đã có, từ dễ hơn trình độ, từ chức năng, tên riêng; ưu tiên từ khó), không gọi
 * AI. Bài dài nên lấy nhiều hơn: tối đa SUGGEST_MAX gợi ý, tích sẵn PRESELECT_MAX từ khó nhất.
 */
import { documentFromText, type OcrDocument } from "@/lib/ocr/document";
import { autoPick, candidateText, type WordInfo } from "@/lib/ocr/pick";

export const SUGGEST_MAX = 40;
export const PRESELECT_MAX = 15;
/** Bài ~8.000 từ cùng dấu câu. */
export const ARTICLE_MAX_TOKENS = 12_000;
/** Văn bản dán thẳng vào ô (khi không đọc được link). */
export const MAX_PASTE_CHARS = 50_000;

export type Suggestion = {
  /** Chỉ số token lần xuất hiện đầu tiên (câu gốc lấy quanh đây). */
  index: number;
  lemma: string;
  cefr: string | null;
  inLibrary: boolean;
  /** Số lần từ gốc này xuất hiện trong bài. */
  count: number;
};

export function articleDocument(text: string): OcrDocument {
  return documentFromText(text, ARTICLE_MAX_TOKENS);
}

export function suggestWords(
  doc: OcrDocument,
  info: ReadonlyMap<string, WordInfo>,
  level: string | null,
): { suggestions: Suggestion[]; preselected: number[] } {
  const counts = new Map<string, number>();
  for (const token of doc.tokens) {
    if (token.kind !== "word") continue;
    const text = candidateText(token.text);
    const lemma = text ? info.get(text)?.lemma : undefined;
    if (lemma) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
  }
  const suggestions = autoPick(doc, info, level, SUGGEST_MAX).map((index) => {
    const word = info.get(candidateText(doc.tokens[index]!.text)!)!;
    return {
      index,
      lemma: word.lemma,
      cefr: word.cefr,
      inLibrary: word.inLibrary,
      count: counts.get(word.lemma) ?? 1,
    };
  });
  return { suggestions, preselected: autoPick(doc, info, level, PRESELECT_MAX) };
}
