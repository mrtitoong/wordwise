import { describe, expect, it } from "vitest";

import { LanguageSchema } from "@/lib/schema/word";

import { DEFAULT_LANGUAGE, languagePack } from ".";

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
