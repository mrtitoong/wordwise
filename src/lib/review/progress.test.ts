import { describe, expect, it } from "vitest";
import { dayProgress, greetingOf, knownWords } from "./progress";
import { correctStreak, isComboMilestone } from "./session";

const VN = "Asia/Ho_Chi_Minh";

describe("dayProgress", () => {
  const now = new Date("2026-11-09T13:00:00Z"); // 20:00 giờ VN
  it("đếm câu đã trả lời trong ngày học, cộng số câu còn lại", () => {
    const logs = [
      { reviewed_at: "2026-11-09T12:00:00Z" }, // 19:00 hôm nay
      { reviewed_at: "2026-11-08T20:30:00Z" }, // 3:30 sáng 9/11 → vẫn ngày học 8/11
      { reviewed_at: "2026-11-08T21:10:00Z" }, // 4:10 sáng 9/11 → hôm nay
    ];
    expect(dayProgress(logs, 6, now, VN)).toEqual({ done: 2, total: 8, ratio: 0.25 });
  });
  it("chưa có việc và chưa làm gì → 0", () => {
    expect(dayProgress([], 0, now, VN).ratio).toBe(0);
  });
  it("làm xong hết → 1", () => {
    expect(dayProgress([{ reviewed_at: "2026-11-09T12:00:00Z" }], 0, now, VN).ratio).toBe(1);
  });
});

describe("greetingOf", () => {
  it.each([
    ["2026-11-09T00:00:00Z", "morning"], // 7:00
    ["2026-11-09T06:00:00Z", "afternoon"], // 13:00
    ["2026-11-09T13:00:00Z", "evening"], // 20:00
    ["2026-11-09T17:30:00Z", "night"], // 0:30
    ["2026-11-08T20:59:00Z", "night"], // 3:59
  ])("%s → %s", (iso, expected) => {
    expect(greetingOf(new Date(iso), VN)).toBe(expected);
  });
});

describe("knownWords", () => {
  it("chỉ đếm thẻ Nghĩa từ mức Đã thuộc", () => {
    const card = (skill: string, stability: number, state = 2) => ({
      skill,
      stability,
      state,
      deleted_at: null,
    });
    expect(
      knownWords([
        card("meaning", 8),
        card("meaning", 30),
        card("meaning", 2),
        card("spelling", 30),
        card("meaning", 30, 1),
      ]),
    ).toBe(2);
  });
});

describe("correctStreak", () => {
  const a = (rating: 1 | 2 | 3 | 4, intro = false) => ({ rating, intro });
  it("đếm từ cuối tới câu Quên gần nhất, bỏ qua lượt xem từ mới", () => {
    expect(correctStreak([a(3), a(1), a(3), a(2, true), a(4), a(2)])).toBe(3);
    expect(correctStreak([a(3), a(1)])).toBe(0);
    expect(correctStreak([])).toBe(0);
  });
  it("mốc khen 3, 5, 10, 15…", () => {
    expect([1, 2, 3, 4, 5, 6, 10, 12, 15].filter(isComboMilestone)).toEqual([3, 5, 10, 15]);
  });
});
