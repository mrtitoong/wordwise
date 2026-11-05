/**
 * Pinyin của câu ví dụ, tính một lần ở máy chủ khi tạo từ (thư viện không tải xuống máy người học).
 * Từ có đúng một âm trong CC-CEDICT lấy theo từ điển, vì thư viện đọc từng chữ nên sai thanh nhẹ (朋友
 * ra péng yǒu, đúng là péngyou). Phần còn lại dùng thư viện: nó chọn được âm của chữ đa âm theo câu.
 */
import { pinyin } from "pinyin-pro";
import { allowedReadings, type Lexicon } from "./lexicon";

/** Từ dài nhất tra trong từ điển khi đọc câu. */
const MAX_WORD_CHARS = 6;

const HAN = /\p{Script=Han}/u;

const PUNCTUATION: Record<string, string> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "：": ":",
  "；": ";",
  "、": ",",
  "（": "(",
  "）": ")",
  "“": '"',
  "”": '"',
};

/** Mọi cụm chữ Hán có thể là từ trong các câu, để tra từ điển một lượt. */
export function sentenceWords(sentences: readonly string[]): string[] {
  const words = new Set<string>();
  for (const sentence of sentences) {
    const chars = Array.from(sentence);
    for (let start = 0; start < chars.length; start++) {
      for (let size = 2; size <= MAX_WORD_CHARS && start + size <= chars.length; size++) {
        const part = chars.slice(start, start + size);
        if (!part.every((char) => HAN.test(char))) break;
        words.add(part.join(""));
      }
    }
  }
  return [...words];
}

const joined = (reading: string) => reading.replaceAll(" ", "");

/** `target`: từ đang học và âm của nghĩa này, luôn được ưu tiên. */
export function sentencePinyin(
  sentence: string,
  lexicon: Lexicon,
  target?: { lemma: string; pinyin: string },
): string {
  const chars = Array.from(sentence);
  const library = pinyin(sentence, { type: "all", toneType: "symbol" });
  const libraryAt = (from: number, to: number) =>
    library
      .slice(from, to)
      .map((item) => item.pinyin)
      .join("");

  /** Số chữ và cách đọc của từ bắt đầu ở `start`; không phải từ ghép thì null. */
  function wordAt(start: number): { size: number; reading: string } | null {
    const rest = chars.slice(start);
    if (target && rest.join("").startsWith(target.lemma)) {
      return { size: Array.from(target.lemma).length, reading: joined(target.pinyin) };
    }
    for (let size = Math.min(MAX_WORD_CHARS, rest.length); size >= 2; size--) {
      const allowed = allowedReadings(lexicon.get(rest.slice(0, size).join("")));
      if (allowed.length === 1) return { size, reading: joined(allowed[0]!.pinyin) };
      if (allowed.length > 1) return { size, reading: libraryAt(start, start + size) };
    }
    return null;
  }

  let out = "";
  let latin = false;
  for (let index = 0; index < chars.length;) {
    const char = chars[index]!;
    if (HAN.test(char)) {
      const word = wordAt(index);
      out += `${out ? " " : ""}${word?.reading ?? library[index]?.pinyin ?? ""}`;
      index += word?.size ?? 1;
      latin = false;
      continue;
    }
    index += 1;
    if (/\s/.test(char)) continue;
    if (/[\p{L}\p{N}]/u.test(char)) {
      out += `${out && !latin ? " " : ""}${char}`;
      latin = true;
    } else {
      out += PUNCTUATION[char] ?? char;
      latin = false;
    }
  }
  return out;
}
