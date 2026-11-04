import type { LanguagePack } from "../types";

/** Chưa tạo audio và nội dung; các phần này thêm ở Z1 (docs/plan-zh.md). */
export const zh: LanguagePack = {
  code: "zh",
  wordAudioVoices: [],
  speechLocale: () => "zh-CN",
  lemmatizes: false,
  usesDictionaryApi: false,
  requiresIpa: false,
};
