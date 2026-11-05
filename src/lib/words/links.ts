import { DEFAULT_LANGUAGE } from "@/lib/lang";
import type { Language, Pos } from "@/lib/schema/word";

/** Đường dẫn tới thẻ từ. */
export function wordHref(wordId: string): string {
  return `/words/${wordId}`;
}

/** Tìm thẻ theo chữ (chip từ liên quan); add: thêm nghĩa phổ biến nhất vào "Sổ của tôi". */
export function lookupHref(
  word: string,
  pos: Pos | null = null,
  add = false,
  language: Language = DEFAULT_LANGUAGE,
): string {
  const params = new URLSearchParams({ lemma: word });
  if (pos) params.set("pos", pos);
  if (add) params.set("add", "1");
  if (language !== DEFAULT_LANGUAGE) params.set("language", language);
  return `/words/lookup?${params}`;
}
