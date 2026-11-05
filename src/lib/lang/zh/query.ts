/**
 * Đọc chữ người học gõ khi tìm từ tiếng Trung: chữ Hán, pinyin có dấu (xuéxiào), pinyin số (xue2xiao4)
 * hoặc pinyin không dấu (xuexiao). Hàm thuần.
 */
import { numberedToMarked, pinyinKey } from "./pinyin";

const HAN = /\p{Script=Han}/u;
const TONE_MARKED = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const U_DIAERESIS = /[üǖǘǚǜ]/g;

export function hasHan(text: string): boolean {
  return HAN.test(text);
}

const plain = (char: string) => char.normalize("NFD").replace(/\p{M}/gu, "");

/** Khóa tìm trong bảng từ điển (bỏ thanh, ü viết v); không phải chữ Latin thì null. */
export function pinyinSearchKey(text: string): string | null {
  const key = plain(text.toLowerCase().replace(U_DIAERESIS, "v")).replace(/[\s'’\-1-5]/g, "");
  return /^[a-z]+$/.test(key) ? key : null;
}

/** Đưa pinyin số về có dấu; phần chưa có số giữ nguyên. */
function normalizedQuery(text: string): string {
  const lower = text.toLowerCase().replaceAll("v", "ü");
  return pinyinKey(lower.replace(/[a-zü]+[1-5]/g, (syllable) => numberedToMarked(syllable)));
}

/** Âm có khớp phần người học đã ghi thanh không; chữ không ghi thanh thì khớp mọi thanh. */
export function matchesToneHint(query: string, pinyin: string): boolean {
  const typed = Array.from(normalizedQuery(query));
  const actual = Array.from(pinyinKey(pinyin));
  return typed.every((char, index) => {
    const other = actual[index];
    if (other === undefined) return false;
    return TONE_MARKED.test(char) ? char === other : plain(char) === plain(other);
  });
}
