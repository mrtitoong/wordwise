/**
 * Free Dictionary API (https://dictionaryapi.dev, dữ liệu Wiktionary, CC BY-SA): IPA và
 * nghĩa tham khảo cho prompt word-content. Dịch vụ miễn phí, không ổn định → mọi lỗi
 * (404, 5xx, quá thời gian, JSON lạ) đều trả null và pipeline chạy tiếp chỉ với LLM.
 */
import { z } from "zod";
import type { Pos, WordContent } from "@/lib/schema/word";

export const FREE_DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DEFAULT_TIMEOUT_MS = 8_000;
/** Số định nghĩa mỗi loại từ đưa vào prompt (đủ tham khảo, không làm prompt dài). */
const MAX_DEFINITIONS = 3;

export interface DictionaryData {
  /** Chỉ IPA âm vị (trong /…/), không kèm dấu "/"; vùng lấy từ tên file audio. */
  ipa: { us: string | null; uk: string | null };
  /** Theo thứ tự trong từ điển (Wiktionary: theo nguồn gốc, KHÔNG theo tần suất). */
  meanings: { pos: Pos; definitions: string[] }[];
}

const ResponseSchema = z.array(
  z.object({
    phonetics: z
      .array(z.object({ text: z.string().nullish(), audio: z.string().nullish() }))
      .default([]),
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

/** "/laɪt/" → "laɪt"; phiên âm hẹp "[ɫɐɪ̯ʔ]" hoặc chuỗi lạ → null. */
export function phonemicIpa(text: string | null | undefined): string | null {
  const match = /^\s*\/([^/]+)\/\s*$/.exec(text ?? "");
  const ipa = match?.[1]?.trim();
  return ipa ? ipa : null;
}

function regionOf(audio: string | null | undefined): "us" | "uk" | null {
  const match = /-(us|uk)\.mp3$/i.exec(audio ?? "");
  return match ? (match[1]!.toLowerCase() as "us" | "uk") : null;
}

export function parseFreeDictionary(json: unknown): DictionaryData | null {
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return null;

  const ipa: DictionaryData["ipa"] = { us: null, uk: null };
  const meanings = new Map<Pos, string[]>();
  for (const entry of parsed.data) {
    for (const phonetic of entry.phonetics) {
      const region = regionOf(phonetic.audio);
      const text = phonemicIpa(phonetic.text);
      if (region && text && ipa[region] === null) ipa[region] = text;
    }
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
  if (meanings.size === 0 && ipa.us === null && ipa.uk === null) return null;
  return {
    ipa,
    meanings: [...meanings].map(([pos, definitions]) => ({ pos, definitions })),
  };
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

/** Phần dữ liệu từ điển đưa vào prompt: chỉ loại từ đang tạo (nếu biết) và IPA. */
export function dictionaryForPrompt(data: DictionaryData | null, pos: Pos | null) {
  if (!data) return undefined;
  const meanings = pos ? data.meanings.filter((m) => m.pos === pos) : data.meanings;
  return { ipa: data.ipa, meanings };
}

/** So sánh IPA bỏ qua dấu tách âm tiết, khoảng trắng (LLM thêm dấu "." còn từ điển thì không). */
function sameIpa(a: string, b: string): boolean {
  const simplify = (s: string) => s.normalize("NFC").replace(/[.\s‿]/g, "");
  return simplify(a) === simplify(b);
}

/**
 * IPA lệch giữa từ điển và LLM → dùng từ điển (docs/plan.md §6). Giữ bản của LLM khi
 * hai bản chỉ khác dấu tách âm tiết. Trả về danh sách vùng đã thay để ghi nhật ký.
 */
export function reconcileIpa(
  content: WordContent,
  data: DictionaryData | null,
): { content: WordContent; replaced: ("us" | "uk")[] } {
  if (!data) return { content, replaced: [] };
  const replaced: ("us" | "uk")[] = [];
  const ipa = { ...content.ipa };
  for (const region of ["us", "uk"] as const) {
    const fromDictionary = data.ipa[region];
    if (!fromDictionary) continue;
    const fromLlm = ipa[region];
    if (fromLlm && sameIpa(fromLlm, fromDictionary)) continue;
    ipa[region] = fromDictionary;
    replaced.push(region);
  }
  return replaced.length ? { content: { ...content, ipa }, replaced } : { content, replaced };
}
