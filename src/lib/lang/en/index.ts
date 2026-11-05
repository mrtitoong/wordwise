import { ENTRY_TABS, type LanguagePack } from "../types";

/** Giọng Azure của tiếng Anh, theo giọng Mỹ/Anh trong Cài đặt. */
export const EN_TTS_VOICES = {
  us: { locale: "en-US", name: "en-US-AvaNeural" },
  uk: { locale: "en-GB", name: "en-GB-SoniaNeural" },
} as const;

export const en: LanguagePack = {
  code: "en",
  requiresFlag: false,
  contentTask: "word-content",
  wordAudioVoices: ["us", "uk"],
  ttsVoice: (voice) => EN_TTS_VOICES[voice],
  speechLocale: (voice) => EN_TTS_VOICES[voice].locale,
  lemmatizes: true,
  usesDictionaryApi: true,
  requiresIpa: true,
  hasReview: true,
  reviewSkills: ["meaning", "spelling", "speaking"],
  hideReadingFromLevel: null,
  speakingPracticeOnly: false,
  writesStrokes: false,
  spellingSetting: "practice_spelling",
  newSpellingPerDay: null,
  entryTabs: ENTRY_TABS,
  isWordText: () => true,
  hasTraditional: false,
  searchesPinyin: false,
  reverseTask: "reverse-lookup",
};
