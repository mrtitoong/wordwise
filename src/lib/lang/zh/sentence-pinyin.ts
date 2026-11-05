/**
 * Pinyin của câu ví dụ, tính một lần ở máy chủ khi tạo từ (thư viện không tải xuống máy người học).
 * Từ có đúng một âm trong CC-CEDICT lấy theo từ điển, vì thư viện đọc từng chữ nên sai thanh nhẹ (朋友
 * ra péng yǒu, đúng là péngyou). Phần còn lại dùng thư viện: nó chọn được âm của chữ đa âm theo câu.
 * Riêng 一 và 不 luôn ghi âm đọc thật như thư viện (yí ge, bú shì) để khớp audio: từ điển ghi âm gốc
 * (yī ge, bù shì), còn thư viện biết chỗ không đổi âm (第一, 星期一, 看一看).
 */
import { pinyin } from "pinyin-pro";
import { allowedReadings, type Lexicon, type Reading } from "./lexicon";
import { pinyinKey } from "./pinyin";

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

/** Âm gốc của các chữ đổi thanh theo chữ đứng sau. */
const BASE_TONE: Record<string, string> = { 一: "yī", 不: "bù" };

const NEUTRAL_TONE = 5;
const PARTICLES = "的了着得地过吗呢吧啊";
const hasNeutralTone = (reading: Reading) => reading.tones.includes(NEUTRAL_TONE);

/** Từ thật sự đọc 了 là liǎo; còn lại 了 trong câu là trợ từ le (到了 trong từ điển đọc dào liǎo). */
const LIAO_WORDS = new Set(["了解", "了不起", "了不得", "受不了", "不得了", "忘不了", "少不了"]);

function readsParticleAsLiao(word: string, reading: Reading): boolean {
  return word.includes("了") && reading.pinyin.includes("liǎo") && !LIAO_WORDS.has(word);
}

/** Có trong từ điển nhưng trong câu gần như luôn là hai từ (这不是 là 这 + 不是). */
const NOT_WORDS = new Set(["这不", "那不"]);

/** Từ thông dụng có thanh nhẹ, hay bị từ đứng trước lấy mất chữ đầu. */
const COMMON_NEUTRAL_WORDS = new Set([
  "衣服",
  "清楚",
  "学生",
  "知识",
  "事情",
  "朋友",
  "时候",
  "东西",
  "地方",
  "漂亮",
  "明白",
  "认识",
  "告诉",
  "意思",
  "便宜",
  "舒服",
  "故事",
  "多少",
  "起来",
]);

/** Từ láy (哥哥), từ có hậu tố 子 (房子), hoặc từ trong danh sách trên. */
function isKnownNeutralWord(word: string): boolean {
  return word[0] === word[1] || word.endsWith("子") || COMMON_NEUTRAL_WORDS.has(word);
}

/**
 * Nhường chữ cuối cho từ sau khi từ sau có thanh nhẹ mà từ này không có: 穿衣服 là 穿 + 衣服 (yīfu),
 * 我哥哥 là 我 + 哥哥 (gēge). Chỉ xét các từ chắc chắn: nới rộng hơn thì tách sai (趁早上车, 一下作业).
 */
function yieldsToNextWord(lexicon: Lexicon, word: readonly string[], next: string | undefined) {
  if (word.length !== 2 || !next) return false;
  // 的, 了 đứng sau là trợ từ, không ghép với chữ trước (国家的 không phải 国 + 家的).
  if (PARTICLES.includes(next)) return false;
  const pair = word[1]! + next;
  if (!isKnownNeutralWord(pair)) return false;
  const following = allowedReadings(lexicon.get(pair));
  const current = allowedReadings(lexicon.get(word.join("")));
  return following.length === 1 && hasNeutralTone(following[0]!) && !current.some(hasNeutralTone);
}

/**
 * Hai âm chỉ khác thanh nhẹ (东西, 地方): câu thường dùng nghĩa đọc thanh nhẹ. Chỉ áp cho từ chắc chắn,
 * vì 把手, 说法, 人家 hay là hai từ hoặc nghĩa khác (把手洗, 说法语).
 */
function neutralReading(word: string, readings: readonly Reading[]): Reading | undefined {
  if (readings.length !== 2 || !COMMON_NEUTRAL_WORDS.has(word)) return undefined;
  const plain = (reading: Reading) =>
    pinyinKey(reading.pinyin).normalize("NFD").replace(/\p{M}/gu, "");
  if (plain(readings[0]!) !== plain(readings[1]!)) return undefined;
  return readings.find(hasNeutralTone);
}

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

  /** Ghép âm của từ bắt đầu ở `start`, đổi 一 và 不 sang âm đọc thật. */
  const spoken = (reading: string, start: number) =>
    reading
      .split(" ")
      .map((syllable, index) => {
        const base = BASE_TONE[chars[start + index] ?? ""];
        return syllable === base ? (library[start + index]?.pinyin ?? syllable) : syllable;
      })
      .join("");

  /** Số chữ và cách đọc của từ bắt đầu ở `start`; không phải từ ghép thì null. */
  function wordAt(start: number): { size: number; reading: string } | null {
    const rest = chars.slice(start);
    const text = rest.join("");
    // Từ láy (哥 trong 哥哥) đọc theo cả từ: chữ sau là thanh nhẹ.
    if (target && text.startsWith(target.lemma) && !text.startsWith(target.lemma.repeat(2))) {
      return { size: Array.from(target.lemma).length, reading: spoken(target.pinyin, start) };
    }
    for (let size = Math.min(MAX_WORD_CHARS, rest.length); size >= 2; size--) {
      const part = rest.slice(0, size);
      const word = part.join("");
      const allowed = allowedReadings(lexicon.get(word));
      if (allowed.length === 0 || NOT_WORDS.has(word)) continue;
      if (allowed.some((r) => readsParticleAsLiao(word, r))) continue;
      if (yieldsToNextWord(lexicon, part, rest[size])) continue;
      const only = allowed.length === 1 ? allowed[0] : neutralReading(word, allowed);
      if (only) return { size, reading: spoken(only.pinyin, start) };
      return { size, reading: libraryAt(start, start + size) };
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
