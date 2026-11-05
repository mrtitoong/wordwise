/**
 * Phần riêng tiếng Trung trên thẻ từ, đọc từ `language_extra`. Hàm thuần; không có thì trả null để
 * màn hình hiện như tiếng Anh, không phải kiểm tra ngôn ngữ trong component.
 */
import type { LanguageExtra } from "@/lib/schema/word";
import { wordChars } from "./han-viet";

export type ZhCardInfo = {
  pinyin: string;
  /** Âm Hán Việt của từng chữ; chữ không có âm thì `am` là null. */
  hanViet: { char: string; am: string | null }[];
  /** Dạng phồn thể, chỉ có khi khác giản thể. */
  traditional: string | null;
  hsk: number | null;
  /** Âm từng nghĩa, chỉ có khi các nghĩa đọc khác nhau. */
  sensePinyin: string[] | null;
  /** Pinyin câu ví dụ theo [nghĩa][câu]. */
  examplePinyin: string[][];
};

type Content = { lemma: string; language_extra: LanguageExtra | null };

export function zhCardInfo({ lemma, language_extra: extra }: Content): ZhCardInfo | null {
  if (extra?.kind !== "zh") return null;
  const hanViet = extra.han_viet ?? [];
  const sensePinyin = extra.sense_pinyin ?? [];
  return {
    pinyin: extra.pinyin,
    hanViet: hanViet.length
      ? wordChars(lemma).map((char, index) => ({ char, am: hanViet[index] ?? null }))
      : [],
    traditional: extra.traditional && extra.traditional !== lemma ? extra.traditional : null,
    hsk: extra.hsk,
    sensePinyin: new Set(sensePinyin).size > 1 ? sensePinyin : null,
    examplePinyin: extra.example_pinyin ?? [],
  };
}
