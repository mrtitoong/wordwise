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

/** Để so hai cách viết pinyin của cùng một âm: bỏ hoa thường, dấu cách, nháy. */
export function pinyinKey(pinyin: string): string {
  return pinyin.toLowerCase().replace(/[\s'’-]/g, "");
}
