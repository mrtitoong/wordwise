import type { LanguagePack } from "../types";
import { hasHan } from "./query";

const ZH_TTS_VOICE = { locale: "zh-CN", name: "zh-CN-XiaoxiaoNeural" };

export const zh: LanguagePack = {
  code: "zh",
  requiresFlag: true,
  contentTask: "word-content-zh",
  wordAudioVoices: ["us"],
  ttsVoice: () => ZH_TTS_VOICE,
  speechLocale: () => ZH_TTS_VOICE.locale,
  lemmatizes: false,
  usesDictionaryApi: false,
  requiresIpa: false,
  hasReview: true,
  reviewSkills: ["meaning", "spelling"],
  hideReadingFromLevel: 2,
  writesStrokes: true,
  spellingSetting: "practice_hanzi",
  // Viết tay lâu hơn gõ nhiều: mở bằng nửa số từ mới mặc định để tải ôn không quá nặng.
  newSpellingPerDay: 5,
  entryTabs: ["typed", "file"],
  isWordText: hasHan,
  hasTraditional: true,
  searchesPinyin: true,
  reverseTask: "reverse-lookup-zh",
};
