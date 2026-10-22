import { describe, expect, it } from "vitest";
import type { PronunciationResult } from "./api";
import { BAND_SYMBOL, hasPhonemeNames, pronunciationTips, scoreBand } from "./feedback";

const result = (
  words: { word: string; phonemes: [string | null, number][] }[],
): PronunciationResult => ({
  overall: 70,
  accuracy: 70,
  fluency: 100,
  completeness: 100,
  recognized: "",
  words: words.map((w) => ({
    word: w.word,
    accuracy: 70,
    errorType: "None",
    phonemes: w.phonemes.map(([ipa, score]) => ({ ipa, score })),
  })),
});

describe("scoreBand", () => {
  it("xanh ≥ 80, vàng 60–79, đỏ < 60; mỗi mức có ký hiệu riêng", () => {
    expect([scoreBand(80), scoreBand(79.9), scoreBand(60), scoreBand(59)]).toEqual([
      "good",
      "fair",
      "fair",
      "poor",
    ]);
    expect(new Set(Object.values(BAND_SYMBOL)).size).toBe(3);
  });
});

describe("pronunciationTips", () => {
  it("âm /θ/ đầu từ và âm cuối /k/ bị nuốt", () => {
    const tips = pronunciationTips(
      result([
        {
          word: "think",
          phonemes: [
            ["θ", 32],
            ["ɪ", 92],
            ["ŋ", 88],
            ["k", 45],
          ],
        },
      ]),
    );
    expect(tips).toEqual([
      { key: "th_voiceless", phoneme: "θ", word: "think" },
      { key: "final_k_g", phoneme: "k", word: "think" },
    ]);
  });

  it("âm cuối: /s/, /z/, /t/; âm cuối khác (l, n) là đừng nuốt âm; /ʃ/ cuối giữ mẹo riêng", () => {
    const keys = (ipa: string) =>
      pronunciationTips(
        result([
          {
            word: "x",
            phonemes: [
              ["æ", 90],
              [ipa, 30],
            ],
          },
        ]),
      ).map((t) => t.key);
    expect(keys("s")).toEqual(["final_s"]);
    expect(keys("z")).toEqual(["final_z"]);
    expect(keys("t")).toEqual(["final_t_d"]);
    expect(keys("l")).toEqual(["final_other"]);
    expect(keys("n")).toEqual(["final_other"]);
    expect(keys("ʃ")).toEqual(["sh_s"]);
  });

  it("âm điểm ≥ 70 không có mẹo; nguyên âm dài; bỏ dấu trọng âm", () => {
    expect(pronunciationTips(result([{ word: "sheep", phonemes: [["ʃ", 85]] }]))).toEqual([]);
    expect(
      pronunciationTips(
        result([
          {
            word: "sheep",
            phonemes: [
              ["ˈiː", 50],
              ["p", 90],
            ],
          },
        ]),
      ),
    ).toEqual([{ key: "long_vowel", phoneme: "iː", word: "sheep" }]);
  });

  it("tối đa 3 mẹo, mỗi loại một lần, âm thấp nhất trước", () => {
    const tips = pronunciationTips(
      result([
        {
          word: "this",
          phonemes: [
            ["ð", 50],
            ["ɪ", 90],
            ["s", 20],
          ],
        },
        {
          word: "thin",
          phonemes: [
            ["θ", 40],
            ["ɪ", 90],
            ["n", 95],
          ],
        },
        {
          word: "very",
          phonemes: [
            ["v", 10],
            ["ɛ", 90],
            ["r", 30],
            ["i", 90],
          ],
        },
        {
          word: "that",
          phonemes: [
            ["ð", 5],
            ["æ", 90],
            ["t", 90],
          ],
        },
      ]),
    );
    expect(tips.map((t) => t.key)).toEqual(["th_voiced", "v", "final_s"]);
  });

  it("giọng Anh (không có tên âm vị): không có mẹo", () => {
    const uk = result([
      {
        word: "water",
        phonemes: [
          [null, 20],
          [null, 30],
        ],
      },
    ]);
    expect(pronunciationTips(uk)).toEqual([]);
    expect(hasPhonemeNames(uk)).toBe(false);
    expect(hasPhonemeNames(result([{ word: "a", phonemes: [["ə", 90]] }]))).toBe(true);
  });
});
