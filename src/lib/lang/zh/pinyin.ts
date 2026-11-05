/**
 * Pinyin dạng số của CC-CEDICT ("ni3 hao3", "nu:3") đổi sang dạng có dấu ("nǐ hǎo", "nǚ").
 * Hàm thuần; thanh 5 là thanh nhẹ.
 */
const MARKS: Record<string, string> = {
  a: "āáǎà",
  e: "ēéěè",
  i: "īíǐì",
  o: "ōóǒò",
  u: "ūúǔù",
  ü: "ǖǘǚǜ",
};

const SYLLABLE = /^([a-zü]+)([1-5])$/;

/** Nguyên âm mang dấu: a, e trước; "ou" dấu ở o; còn lại là nguyên âm cuối. */
function markIndex(letters: string): number {
  for (const vowel of ["a", "e"]) {
    const at = letters.indexOf(vowel);
    if (at >= 0) return at;
  }
  const ou = letters.indexOf("ou");
  if (ou >= 0) return ou;
  for (let i = letters.length - 1; i >= 0; i--) if (MARKS[letters[i]!]) return i;
  return -1;
}

function markSyllable(letters: string, tone: number): string {
  const at = tone === 5 ? -1 : markIndex(letters);
  if (at < 0) return letters;
  return letters.slice(0, at) + MARKS[letters[at]!]![tone - 1]! + letters.slice(at + 1);
}

type Syllable = { text: string; tone: number };

function syllables(numbered: string): Syllable[] {
  const out: Syllable[] = [];
  for (const raw of numbered.toLowerCase().replaceAll("u:", "ü").split(/\s+/)) {
    const match = SYLLABLE.exec(raw);
    if (!match) continue;
    const [, letters, tone] = match;
    // "dian3 r5": âm cuốn lưỡi gắn vào âm tiết trước, không thành âm tiết riêng.
    if (letters === "r" && out.length > 0) out.at(-1)!.text += "r";
    else out.push({ text: markSyllable(letters!, Number(tone)), tone: Number(tone) });
  }
  return out;
}

export function numberedToMarked(numbered: string): string {
  return syllables(numbered)
    .map((s) => s.text)
    .join(" ");
}

export function tonesOf(numbered: string): number[] {
  return syllables(numbered).map((s) => s.tone);
}

const TONE_MARKS: Record<string, number> = { "\u0304": 1, "\u0301": 2, "\u030C": 3, "\u0300": 4 };

/** Thanh của một âm có dấu; không có dấu là thanh nhẹ (5). */
function toneOfMarked(syllable: string): number {
  for (const char of syllable.normalize("NFD")) {
    const tone = TONE_MARKS[char];
    if (tone) return tone;
  }
  return 5;
}

/** 一 đứng sau các chữ này đọc yī: số đếm, thứ tự (第一次, 十一月) và từ gốc 统一, 唯一, 单一. */
const YI_KEPT_AFTER = "第十百千万二三四五六七八九零〇统唯单";
/** 一 đứng trước các chữ này đọc yī: số, ngày tháng, thứ hạng (一月, 一号, 一楼, 一二三, 一等, 一级). */
const YI_KEPT_BEFORE = "月号楼等级一二三四五六七八九十零〇";

/**
 * Pinyin để hiển thị, khớp với audio: 一 và 不 đổi thanh theo âm đứng sau (yī qǐ → yì qǐ, bù duì →
 * bú duì). Dữ liệu vẫn giữ âm gốc như từ điển, để tìm kiếm và tra cứu. Biến điệu thanh 3 (你好 đọc
 * ní hǎo) không đổi vì mọi giáo trình đều viết nguyên dấu gốc.
 */
export function spokenPinyin(lemma: string, pinyin: string): string {
  const chars = Array.from(lemma);
  const parts = pinyin.split(" ");
  return parts
    .map((syllable, index) => {
      const next = parts[index + 1];
      if (!next) return syllable;
      const tone = toneOfMarked(next);
      if (chars[index] === "不" && syllable === "bù") return tone === 4 ? "bú" : syllable;
      if (chars[index] !== "一" || syllable !== "yī") return syllable;
      const before = chars[index - 1];
      const after = chars[index + 1];
      // Động từ láy: 等一等 đọc yi nhẹ.
      if (before && before === after) return "yi";
      if ((before && YI_KEPT_AFTER.includes(before)) || (after && YI_KEPT_BEFORE.includes(after))) {
        return syllable;
      }
      return tone === 4 || tone === 5 ? "yí" : "yì";
    })
    .join(" ");
}

/** Để so hai cách viết pinyin của cùng một âm: bỏ hoa thường, dấu cách, nháy. */
export function pinyinKey(pinyin: string): string {
  return pinyin.toLowerCase().replace(/[\s'’-]/g, "");
}
