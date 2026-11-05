import { describe, expect, it } from "vitest";
import { languageVoice } from "@/lib/lang";
import { readingConcealed } from "./cues";
import { practiceModesFor } from "./practice";

const card = (state: number, stability: number) => ({ state, stability, deleted_at: null });

describe("readingConcealed", () => {
  it("tiếng Trung: mức 0–1 hiện pinyin", () => {
    expect(readingConcealed("zh", card(0, 0), false)).toBe(false);
    expect(readingConcealed("zh", card(1, 1), false)).toBe(false);
    expect(readingConcealed("zh", card(2, 2), false)).toBe(false);
  });

  it("tiếng Trung: từ mức 2 ẩn tới khi trả lời", () => {
    expect(readingConcealed("zh", card(2, 3), false)).toBe(true);
    expect(readingConcealed("zh", card(2, 30), false)).toBe(true);
    expect(readingConcealed("zh", card(2, 30), true)).toBe(false);
  });

  it("tiếng Anh luôn hiện", () => {
    expect(readingConcealed("en", card(2, 30), false)).toBe(false);
  });
});

describe("languageVoice", () => {
  it("tiếng Anh theo giọng trong Cài đặt", () => {
    expect(languageVoice("en", "uk")).toBe("uk");
  });

  it("tiếng Trung chỉ có một giọng, chọn giọng Anh vẫn nghe được", () => {
    expect(languageVoice("zh", "uk")).toBe("us");
  });
});

describe("practiceModesFor", () => {
  it("chỉ có thẻ Nghĩa thì không có Tập viết và Phát âm", () => {
    expect(practiceModesFor(["meaning"])).toEqual(["auto", "flashcard", "mcq", "listening"]);
  });

  it("phát âm chỉ để luyện thì vẫn có chế độ Phát âm", () => {
    expect(practiceModesFor(["meaning", "spelling"], true)).toContain("speaking");
  });

  it("đủ kỹ năng thì có mọi chế độ", () => {
    expect(practiceModesFor(["meaning", "spelling", "speaking"])).toHaveLength(6);
  });
});
