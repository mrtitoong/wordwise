import type { Language } from "@/lib/schema/word";

import { DEFAULT_LANGUAGE, LANGUAGES, languagePack } from ".";

/** Ngôn ngữ đang học trong Cài đặt; giá trị lạ thì dùng ngôn ngữ mặc định. */
export function learningLanguage(target: string | null | undefined): Language {
  return LANGUAGES.find((code) => code === target) ?? DEFAULT_LANGUAGE;
}

/**
 * Từ của từng ngôn ngữ có phiên ôn, để số từ mới mỗi ngày tính riêng từng ngôn ngữ. Ngôn ngữ của từ
 * là ngôn ngữ của sổ chứa nó; không nằm trong sổ nào thì coi như ngôn ngữ mặc định. Từ của ngôn ngữ
 * chưa có phiên ôn bị bỏ: các từ này chưa được mở từ Sắp học.
 */
export function wordsByLanguage<UserWord extends { id: string }>(
  userWords: readonly UserWord[],
  notebooks: readonly { id: string; language: string }[],
  entries: readonly { notebook_id: string; user_word_id: string }[],
): Map<Language, UserWord[]> {
  const notebookLanguage = new Map(notebooks.map((n) => [n.id, learningLanguage(n.language)]));
  const wordLanguage = new Map<string, Language>();
  for (const entry of entries) {
    const language = notebookLanguage.get(entry.notebook_id);
    if (language) wordLanguage.set(entry.user_word_id, language);
  }
  const groups = new Map<Language, UserWord[]>();
  for (const word of userWords) {
    const language = wordLanguage.get(word.id) ?? DEFAULT_LANGUAGE;
    if (!languagePack(language).hasReview) continue;
    const group = groups.get(language);
    if (group) group.push(word);
    else groups.set(language, [word]);
  }
  return groups;
}

type Scoped<UserWord, Card, Entry, Notebook> = {
  userWords: readonly UserWord[];
  cards: readonly Card[];
  entries: readonly Entry[];
  notebooks: readonly Notebook[];
};

/**
 * Chỉ giữ dữ liệu học của một ngôn ngữ, để thẻ các ngôn ngữ không trộn vào nhau; thẻ của kỹ năng
 * ngôn ngữ đó chưa ôn được cũng bị bỏ. `languageOf`: ngôn ngữ của một nghĩa; máy chưa có nội dung
 * thì trả undefined, coi như ngôn ngữ mặc định.
 */
export function forLanguage<
  UserWord extends { id: string; sense_id: string },
  Card extends { user_word_id: string; skill: string },
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
  const skills: readonly string[] = languagePack(language).reviewSkills;
  return {
    userWords,
    cards: data.cards.filter((c) => kept.has(c.user_word_id) && skills.includes(c.skill)),
    entries: data.entries.filter((e) => kept.has(e.user_word_id)),
    notebooks: data.notebooks.filter((n) => n.language === language),
  };
}
