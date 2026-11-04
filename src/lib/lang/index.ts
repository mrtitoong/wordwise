import type { Language } from "@/lib/schema/word";

import { en } from "./en";
import type { LanguagePack } from "./types";
import { zh } from "./zh";

export type { LanguagePack } from "./types";

/** Ngôn ngữ dùng khi chưa biết người học đang học gì. */
export const DEFAULT_LANGUAGE = "en" satisfies Language;

const PACKS: Partial<Record<Language, LanguagePack>> = { en, zh };

/** Ngôn ngữ chưa làm: chỉ giữ chữ người dùng nhập, không có tính năng riêng. */
function plainPack(code: Language): LanguagePack {
  return {
    code,
    wordAudioVoices: [],
    speechLocale: () => code,
    lemmatizes: false,
    usesDictionaryApi: false,
    requiresIpa: false,
  };
}

export function languagePack(code: Language): LanguagePack {
  return PACKS[code] ?? plainPack(code);
}
