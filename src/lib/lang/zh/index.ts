import type { LanguagePack } from "../types";

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
};
