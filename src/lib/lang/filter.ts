import type { Language } from "@/lib/schema/word";

import { DEFAULT_LANGUAGE, LANGUAGES } from ".";

/** Ngôn ngữ đang học trong Cài đặt; giá trị lạ thì dùng ngôn ngữ mặc định. */
export function learningLanguage(target: string | null | undefined): Language {
  return LANGUAGES.find((code) => code === target) ?? DEFAULT_LANGUAGE;
}

type Scoped<UserWord, Card, Entry, Notebook> = {
  userWords: readonly UserWord[];
  cards: readonly Card[];
  entries: readonly Entry[];
  notebooks: readonly Notebook[];
};

/**
 * Chỉ giữ dữ liệu học của một ngôn ngữ, để thẻ các ngôn ngữ không trộn vào nhau. `languageOf`: ngôn
 * ngữ của một nghĩa; máy chưa có nội dung thì trả undefined, coi như ngôn ngữ mặc định.
 */
export function forLanguage<
  UserWord extends { id: string; sense_id: string },
  Card extends { user_word_id: string },
  Entry extends { user_word_id: string },
  Notebook extends { language: string },
>(
  data: Scoped<UserWord, Card, Entry, Notebook>,
  language: Language,
  languageOf: (senseId: string) => string | undefined,
): { userWords: UserWord[]; cards: Card[]; entries: Entry[]; notebooks: Notebook[] } {
  const userWords = data.userWords.filter(
    (uw) => (languageOf(uw.sense_id) ?? DEFAULT_LANGUAGE) === language,
  );
  const kept = new Set(userWords.map((uw) => uw.id));
  return {
    userWords,
    cards: data.cards.filter((c) => kept.has(c.user_word_id)),
    entries: data.entries.filter((e) => kept.has(e.user_word_id)),
    notebooks: data.notebooks.filter((n) => n.language === language),
  };
}
