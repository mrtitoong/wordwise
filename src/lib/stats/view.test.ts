import { describe, expect, it } from "vitest";
import { forgottenList, heatLevel, heatmapWeeks, sumDays } from "./view";

describe("heatLevel", () => {
  it("chia 5 mức: chưa học, < 5, < 15, < 30, từ 30 phút", () => {
    expect([0, 0.5, 4.9, 5, 14, 15, 29, 30, 120].map(heatLevel)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe("heatmapWeeks", () => {
  it("cột theo tuần, thứ Hai trên cùng, ô trước ngày đầu để trống", () => {
    // 21/10/2026 là thứ Tư.
    const days = [
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ].map((day) => ({ day, value: 1 }));
    const weeks = heatmapWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.slice(0, 2)).toEqual([null, null]);
    expect(weeks[0]![2]!.day).toBe("2026-10-21");
    expect(weeks[0]![6]!.day).toBe("2026-10-25");
    expect(weeks[1]).toEqual([{ day: "2026-10-26", value: 1 }]);
    expect(heatmapWeeks([])).toEqual([]);
  });
});

describe("forgottenList", () => {
  it("quên nhiều trong 30 ngày trước, rồi leech chưa có; đánh dấu leech; tối đa 10", () => {
    const recent = [
      { userWordId: "a", count: 4 },
      { userWordId: "b", count: 2 },
    ];
    const leeches = [
      { userWordId: "c", count: 9 },
      { userWordId: "a", count: 7 },
    ];
    expect(forgottenList(recent, leeches)).toEqual([
      { userWordId: "a", recent: 4, lapses: 7 },
      { userWordId: "b", recent: 2, lapses: null },
      { userWordId: "c", recent: null, lapses: 9 },
    ]);
    expect(forgottenList(recent, leeches, 1)).toHaveLength(1);
  });
});

it("sumDays", () => {
  expect(
    sumDays([
      { day: "x", value: 1.5 },
      { day: "y", value: 2 },
    ]),
  ).toBe(3.5);
});
