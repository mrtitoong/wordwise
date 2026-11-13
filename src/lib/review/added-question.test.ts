import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { addedQuestionReason } from "./added-question";

describe("addedQuestionReason", () => {
  it("nêu lý do theo cách trả lời", () => {
    const writing = { mode: "writing", rating: Rating.Hard } as const;
    expect(addedQuestionReason({ ...writing, usedHint: true, hintLevel: 4 })).toBe("hint");
    expect(addedQuestionReason({ ...writing, typoCount: 1 })).toBe("typo");
    expect(addedQuestionReason(writing)).toBe("hard");
    expect(addedQuestionReason({ mode: "mcq", rating: Rating.Again })).toBe("wrong");
  });

  it("trả lời sai được ưu tiên hơn gợi ý", () => {
    expect(addedQuestionReason({ mode: "writing", rating: Rating.Again, usedHint: true })).toBe(
      "wrong",
    );
  });

  it("tập nghe nói rõ nghe lại nhiều lần cũng tính", () => {
    expect(addedQuestionReason({ mode: "listening", rating: Rating.Hard, usedHint: true })).toBe(
      "listenHint",
    );
  });

  it("flashcard và phát âm không nói là trả lời sai", () => {
    expect(addedQuestionReason({ mode: "flashcard", rating: Rating.Again })).toBe("self");
    expect(addedQuestionReason({ mode: "speaking", rating: Rating.Again })).toBe("speaking");
  });
});
