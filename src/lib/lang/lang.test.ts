import { describe, expect, it } from "vitest";

import { LanguageSchema } from "@/lib/schema/word";

import { DEFAULT_LANGUAGE, languagePack } from ".";
import { forLanguage, learningLanguage } from "./filter";

describe("languagePack", () => {
  it("giữ nguyên hành vi tiếng Anh", () => {
    const pack = languagePack("en");
    expect(pack.wordAudioVoices).toEqual(["us", "uk"]);
    expect(pack.speechLocale("us")).toBe("en-US");
    expect(pack.speechLocale("uk")).toBe("en-GB");
    expect(pack).toMatchObject({ lemmatizes: true, usesDictionaryApi: true, requiresIpa: true });
  });

  it("tiếng Trung chưa bật audio, từ gốc, từ điển", () => {
    const pack = languagePack("zh");
    expect(pack.wordAudioVoices).toEqual([]);
    expect(pack.speechLocale("uk")).toBe("zh-CN");
    expect(pack).toMatchObject({ lemmatizes: false, usesDictionaryApi: false, requiresIpa: false });
  });

  it("mọi ngôn ngữ trong schema đều có gói đúng mã", () => {
    for (const code of LanguageSchema.options) expect(languagePack(code).code).toBe(code);
  });

  it("ngôn ngữ chưa làm không có tính năng riêng", () => {
    expect(languagePack("ja")).toMatchObject({
      wordAudioVoices: [],
      lemmatizes: false,
      usesDictionaryApi: false,
      requiresIpa: false,
    });
  });

  it("mặc định là tiếng Anh", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});

describe("lọc theo ngôn ngữ đang học", () => {
  const data = {
    userWords: [
      { id: "u-en", sense_id: "s-en" },
      { id: "u-zh", sense_id: "s-zh" },
      { id: "u-unknown", sense_id: "s-unknown" },
    ],
    cards: [{ user_word_id: "u-en" }, { user_word_id: "u-zh" }, { user_word_id: "u-unknown" }],
    entries: [{ user_word_id: "u-zh" }],
    notebooks: [{ language: "en" }, { language: "zh" }],
  };
  const languageOf = (id: string) =>
    ({ "s-en": "en", "s-zh": "zh" })[id] as "en" | "zh" | undefined;

  it("tiếng Anh: giữ cả từ máy chưa có nội dung, như trước khi có lọc", () => {
    const out = forLanguage(data, "en", languageOf);
    expect(out.userWords.map((u) => u.id)).toEqual(["u-en", "u-unknown"]);
    expect(out.cards).toHaveLength(2);
    expect(out.entries).toEqual([]);
    expect(out.notebooks).toEqual([{ language: "en" }]);
  });

  it("tiếng Trung: chỉ dữ liệu tiếng Trung, không trộn thẻ", () => {
    const out = forLanguage(data, "zh", languageOf);
    expect(out.userWords.map((u) => u.id)).toEqual(["u-zh"]);
    expect(out.cards).toEqual([{ user_word_id: "u-zh" }]);
    expect(out.entries).toEqual([{ user_word_id: "u-zh" }]);
    expect(out.notebooks).toEqual([{ language: "zh" }]);
  });

  it("ngôn ngữ đang học: thiếu hoặc lạ thì dùng mặc định", () => {
    expect(learningLanguage("zh")).toBe("zh");
    expect(learningLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(learningLanguage("xx")).toBe(DEFAULT_LANGUAGE);
  });
});
