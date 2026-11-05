import { describe, expect, it } from "vitest";
import type { PronunciationResult } from "./api";
import { assessmentParams } from "./scorer";
import { zhBand, zhSyllables, zhTips } from "./zh-feedback";

const result = (scores: number[], accuracy = 80, overall = 80): PronunciationResult => ({
  overall,
  accuracy,
  fluency: 100,
  completeness: 100,
  recognized: "",
  words: [
    {
      word: "x",
      accuracy,
      errorType: "None",
      phonemes: scores.map((score) => ({ ipa: "xue 2", score })),
    },
  ],
});

describe("zhBand", () => {
  it("theo độ chính xác, không theo điểm tổng", () => {
    expect(zhBand(result([], 85, 11))).toBe("good");
    expect(zhBand(result([], 65, 95))).toBe("fair");
    expect(zhBand(result([], 40, 95))).toBe("poor");
  });
});

describe("zhSyllables", () => {
  it("ghép từng chữ với âm và mức", () => {
    expect(zhSyllables(result([90, 50]), "学校", "xué xiào")).toEqual([
      { text: "学", pinyin: "xué", score: 90, band: "good" },
      { text: "校", pinyin: "xiào", score: 50, band: "poor" },
    ]);
  });

  it("từ có âm cuốn chỉ hiện pinyin", () => {
    expect(zhSyllables(result([90, 90]), "一点儿", "yì diǎnr")?.map((s) => s.text)).toEqual([
      "yì",
      "diǎnr",
    ]);
  });

  it("Azure tách âm cuốn thành âm r riêng", () => {
    const erhua = result([90, 80, 100]);
    erhua.words[0]!.phonemes[2]!.ipa = "r";
    expect(zhSyllables(erhua, "一点儿", "yì diǎnr")?.map((s) => s.score)).toEqual([90, 80]);
  });

  it("số âm không khớp thì không hiện từng chữ", () => {
    expect(zhSyllables(result([90]), "学校", "xué xiào")).toBeNull();
    expect(zhSyllables(result([]), "学校", "xué xiào")).toBeNull();
  });
});

describe("zhTips", () => {
  const syllable = (pinyin: string, score: number) => ({
    text: "x",
    pinyin,
    score,
    band: "poor" as const,
  });

  it("chọn mẹo theo âm yếu nhất, không lặp loại mẹo", () => {
    expect(
      zhTips([syllable("zhōng", 60), syllable("shuō", 40), syllable("qù", 30), syllable("rè", 50)]),
    ).toEqual([
      { key: "umlaut", pinyin: "qù" },
      { key: "retroflex", pinyin: "shuō" },
      { key: "r", pinyin: "rè" },
    ]);
  });

  it("nhận từng nhóm âm", () => {
    const keyOf = (pinyin: string) => zhTips([syllable(pinyin, 10)])[0]?.key;
    expect(keyOf("lǜ")).toBe("umlaut");
    expect(keyOf("xiǎo")).toBe("palatal");
    expect(keyOf("cài")).toBe("dental");
    expect(keyOf("tā")).toBe("aspirated");
    expect(keyOf("bà")).toBe("unaspirated");
    expect(keyOf("wáng")).toBe("ng");
    expect(keyOf("ài")).toBeUndefined();
  });

  it("âm đủ tốt thì không có mẹo", () => {
    expect(zhTips([syllable("zhōng", 75)])).toEqual([]);
  });
});

describe("assessmentParams", () => {
  it("zh-CN dùng SAPI (Azure không có IPA cho tiếng Trung)", () => {
    expect(assessmentParams("学校", "zh-CN").PhonemeAlphabet).toBe("SAPI");
    expect(assessmentParams("school", "en-US").PhonemeAlphabet).toBe("IPA");
    expect("PhonemeAlphabet" in assessmentParams("school", "en-GB")).toBe(false);
  });
});
