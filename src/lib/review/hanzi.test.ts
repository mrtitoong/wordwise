import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { gradeFromOutcome } from "@/lib/srs/grade";
import {
  allowedMistakes,
  hanziParts,
  hanziResult,
  missedStrokes,
  showsOutline,
  strokeDataUrl,
} from "./hanzi";

describe("hanziParts", () => {
  it("chỉ chữ Hán phải viết", () => {
    expect(hanziParts("T恤")).toEqual([
      { char: "T", write: false },
      { char: "恤", write: true },
    ]);
  });
});

describe("strokeDataUrl", () => {
  it("mã hóa chữ Hán trong đường dẫn", () => {
    expect(strokeDataUrl("人")).toBe("/hanzi/%E4%BA%BA.json");
  });
});

describe("showsOutline", () => {
  it("mức 0–2 có nét mờ, mức 3–4 tự nhớ", () => {
    expect([0, 1, 2, 3, 4].map((level) => showsOutline(level as 0))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("missedStrokes", () => {
  it("thử lại một nét nhiều lần chỉ tính một nét sai", () => {
    const sameStroke = { part: 0, stroke: 4 };
    expect(missedStrokes([sameStroke, sameStroke, sameStroke])).toBe(1);
  });

  it("cùng số nét ở hai chữ khác nhau là hai nét sai", () => {
    expect(
      missedStrokes([
        { part: 0, stroke: 1 },
        { part: 1, stroke: 1 },
      ]),
    ).toBe(2);
  });

  it("một nét khó thử nhiều lần không làm hỏng cả chữ 10 nét", () => {
    const stroke = { part: 0, stroke: 7 };
    const mistakes = missedStrokes([stroke, stroke, stroke, stroke]);
    expect(hanziResult({ strokes: 10, mistakes, hints: 0 }).correct).toBe(true);
  });
});

describe("hanziResult", () => {
  it("từ ngắn vẫn được sai 1 nét", () => {
    expect(allowedMistakes(2)).toBe(1);
    expect(allowedMistakes(18)).toBe(3);
  });

  it("sai vượt 20% số nét là sai", () => {
    expect(hanziResult({ strokes: 10, mistakes: 3, hints: 0 }).correct).toBe(false);
    expect(hanziResult({ strokes: 10, mistakes: 2, hints: 0 })).toEqual({
      correct: true,
      usedHint: true,
    });
  });

  const grade = (result: { correct: boolean; usedHint: boolean }, responseMs = 60_000) =>
    gradeFromOutcome({
      mode: "writing",
      ...result,
      responseMs,
      userMedianMs: 5_000,
      untimed: true,
      maxRating: Rating.Good,
      cardLevel: 2,
    });

  it("đúng hết là Nhớ, dù viết lâu hay rất nhanh", () => {
    const result = hanziResult({ strokes: 8, mistakes: 0, hints: 0 });
    expect(grade(result)).toBe(Rating.Good);
    expect(grade(result, 500)).toBe(Rating.Good);
  });

  it("có gợi ý hoặc sai ít là Khó, sai nhiều là Quên", () => {
    expect(grade(hanziResult({ strokes: 8, mistakes: 0, hints: 1 }))).toBe(Rating.Hard);
    expect(grade(hanziResult({ strokes: 8, mistakes: 1, hints: 0 }))).toBe(Rating.Hard);
    expect(grade(hanziResult({ strokes: 8, mistakes: 4, hints: 0 }))).toBe(Rating.Again);
  });
});
