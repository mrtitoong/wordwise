import { describe, expect, it } from "vitest";
import { reminderMessage } from "./message";

describe("reminderMessage", () => {
  it("cụ thể số từ và thời gian; tiếng Việt mặc định", () => {
    // 12 lượt ôn × 8 giây ≈ 2 phút.
    expect(reminderMessage({ reviews: 12, news: 0 }, "vi")).toEqual({
      title: "Đến giờ ôn từ rồi",
      body: "12 từ đang chờ ôn, khoảng 2 phút.",
      url: "/",
    });
    expect(reminderMessage({ reviews: 0, news: 5 }, "vi")!.body).toBe(
      "5 từ mới đang chờ, khoảng 2 phút.",
    );
    expect(reminderMessage({ reviews: 30, news: 10 }, "vi")!.body).toBe(
      "30 từ cần ôn và 10 từ mới, khoảng 7 phút.",
    );
  });

  it("tiếng Anh, số ít/số nhiều", () => {
    expect(reminderMessage({ reviews: 1, news: 0 }, "en")!.body).toBe(
      "1 word is waiting, about 1 min.",
    );
    expect(reminderMessage({ reviews: 3, news: 2 }, "en")!.body).toBe(
      "3 words to review and 2 new, about 1 min.",
    );
  });

  it("không có gì để học thì không nhắc", () => {
    expect(reminderMessage({ reviews: 0, news: 0 }, "vi")).toBeNull();
  });
});
