/**
 * Free Dictionary API (https://dictionaryapi.dev, dữ liệu Wiktionary, CC BY-SA): nghĩa
 * tham khảo cho prompt word-content.
 *
 * Không dùng IPA của từ điển (chốt 2026-10-21): Wiktionary hay ghi phiên âm kỹ thuật (ɹ, d͡ʒ,
 * "ɡʊ(d)") khó đọc với người học; IPA trên thẻ do model viết theo ký hiệu sách học.
 *
 * Dịch vụ miễn phí, không ổn định → mọi lỗi (404, 5xx, quá thời gian, JSON lạ) đều trả null
 * và pipeline chạy tiếp chỉ với LLM.
 */
import { z } from "zod";
import type { Pos } from "@/lib/schema/word";

export const FREE_DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DEFAULT_TIMEOUT_MS = 8_000;
/** Số định nghĩa mỗi loại từ đưa vào prompt (đủ tham khảo, không làm prompt dài). */
const MAX_DEFINITIONS = 3;

export interface DictionaryData {
  /** Theo thứ tự trong từ điển (Wiktionary: theo nguồn gốc, KHÔNG theo tần suất). */
  meanings: { pos: Pos; definitions: string[] }[];
}

const ResponseSchema = z.array(
  z.object({
    meanings: z
      .array(
        z.object({
          partOfSpeech: z.string(),
          definitions: z.array(z.object({ definition: z.string() })).default([]),
        }),
      )
      .default([]),
  }),
);

const POS_MAP: Record<string, Pos> = {
  noun: "noun",
  verb: "verb",
  adjective: "adjective",
  adverb: "adverb",
  pronoun: "pronoun",
  preposition: "preposition",
  conjunction: "conjunction",
  determiner: "determiner",
  article: "determiner",
  interjection: "interjection",
  "phrasal verb": "phrasal_verb",
  phrase: "phrase",
  idiom: "phrase",
};

export function parseFreeDictionary(json: unknown): DictionaryData | null {
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return null;

  const meanings = new Map<Pos, string[]>();
  for (const entry of parsed.data) {
    for (const meaning of entry.meanings) {
      const pos = POS_MAP[meaning.partOfSpeech.toLowerCase()];
      if (!pos) continue;
      const list = meanings.get(pos) ?? [];
      for (const { definition } of meaning.definitions) {
        if (list.length < MAX_DEFINITIONS && definition.trim()) list.push(definition.trim());
      }
      meanings.set(pos, list);
    }
  }
  if (meanings.size === 0) return null;
  return { meanings: [...meanings].map(([pos, definitions]) => ({ pos, definitions })) };
}

export async function fetchFreeDictionary(
  lemma: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<DictionaryData | null> {
  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(FREE_DICTIONARY_URL + encodeURIComponent(lemma), {
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseFreeDictionary(await response.json());
  } catch {
    return null;
  }
}

/** Phần dữ liệu từ điển đưa vào prompt: chỉ loại từ đang tạo (nếu biết). */
export function dictionaryForPrompt(data: DictionaryData | null, pos: Pos | null) {
  if (!data) return undefined;
  const meanings = pos ? data.meanings.filter((m) => m.pos === pos) : data.meanings;
  return meanings.length ? { meanings } : undefined;
}
