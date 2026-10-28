/**
 * Tra kho mọi chữ của một văn bản (ảnh chụp, bài viết): từ gốc, CEFR, người dùng đã có chưa. Gửi
 * theo lô 50 chữ (giới hạn của generate-word "resolve"), tối đa PARALLEL lô cùng lúc – bài viết dài
 * có thể tới vài nghìn chữ khác nhau.
 */
import type { OcrDocument } from "@/lib/ocr/document";
import { lookupTerms, type WordInfo } from "@/lib/ocr/pick";
import { createClient } from "@/lib/supabase/client";
import { resolveWords } from "@/lib/words/request-word";

const CHUNK = 50;
const PARALLEL = 4;

export async function lookupWords(
  doc: OcrDocument,
  owned: ReadonlySet<string>,
): Promise<Map<string, WordInfo>> {
  const terms = lookupTerms(doc);
  const info = new Map<string, WordInfo>();
  const chunks: string[][] = [];
  for (let i = 0; i < terms.length; i += CHUNK) chunks.push(terms.slice(i, i + CHUNK));
  const client = createClient();
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++]!;
      const { items } = await resolveWords(client, chunk);
      chunk.forEach((term, i) => {
        const item = items[i];
        if (!item) return;
        info.set(term, {
          lemma: item.lemma,
          inLibrary: item.words.length > 0,
          cefr: item.words[0]?.cefr ?? null,
          owned: item.words.some((w) => w.senses.some((s) => owned.has(s.id))),
        });
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
  return info;
}
