import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";

import { en } from "./en";
import { ENTRY_TABS, type LanguagePack } from "./types";
import { zh } from "./zh";

export type { EntryTab, LanguagePack } from "./types";

/** Như LanguageSchema, viết riêng để trang chính lọc theo ngôn ngữ mà không phải tải Zod. */
export const LANGUAGES = ["en", "ja", "zh", "ko", "fr"] as const satisfies readonly Language[];

/** Ngôn ngữ dùng khi chưa biết người học đang học gì. */
export const DEFAULT_LANGUAGE = "en" satisfies Language;

const PACKS: Partial<Record<Language, LanguagePack>> = { en, zh };

/** Ngôn ngữ chưa làm: chỉ giữ chữ người dùng nhập, không có tính năng riêng. */
function plainPack(code: Language): LanguagePack {
  return {
    code,
    requiresFlag: true,
    contentTask: "word-content",
    wordAudioVoices: [],
    ttsVoice: () => {
      throw new Error(`Chưa có giọng đọc cho ${code}`);
    },
    speechLocale: () => code,
    lemmatizes: false,
    usesDictionaryApi: false,
    requiresIpa: false,
    hasReview: false,
    reviewSkills: ["meaning"],
    hideReadingFromLevel: null,
    writesStrokes: false,
    spellingSetting: "practice_spelling",
    newSpellingPerDay: null,
    entryTabs: ENTRY_TABS,
    isWordText: () => true,
    hasTraditional: false,
    searchesPinyin: false,
    reverseTask: "reverse-lookup",
  };
}

export function languagePack(code: Language): LanguagePack {
  return PACKS[code] ?? plainPack(code);
}

/** Giọng có audio của ngôn ngữ, theo giọng trong Cài đặt (tiếng Trung chỉ có một giọng). */
export function languageVoice(code: Language, preferred: Voice): Voice {
  const voices = languagePack(code).wordAudioVoices;
  return voices.find((voice) => voice === preferred) ?? voices[0] ?? preferred;
}
