import { describe, expect, it } from "vitest";
import { estimateDailyReviews, nearestRetention, RETENTION_OPTIONS } from "./retention";
import { RETENTION_LOAD } from "./retention-load";

describe("tỉ lệ nhớ mong muốn", () => {
  it("giá trị lẻ trong database về mức gần nhất", () => {
    expect(nearestRetention(0.88)).toBe(0.9);
    expect(nearestRetention(0.82)).toBe(0.8);
    expect(nearestRetention(0.95)).toBe(0.95);
  });

  it("bảng có đủ các mức; nhớ chắc hơn thì ôn nhiều hơn", () => {
    for (const row of Object.values(RETENTION_LOAD)) {
      const loads = RETENTION_OPTIONS.map((r) => row[r]!.meaning);
      expect(loads).toEqual([...loads].sort((a, b) => a - b));
      for (const r of RETENTION_OPTIONS) expect(row[r]!.spelling).toBeGreaterThan(row[r]!.meaning);
    }
  });

  it("tra bảng, nội suy giữa các mức số từ mới", () => {
    expect(estimateDailyReviews(10, 0.9, false)).toBe(RETENTION_LOAD[10]![0.9]!.meaning);
    expect(estimateDailyReviews(10, 0.9, true)).toBe(RETENTION_LOAD[10]![0.9]!.spelling);
    const mid = estimateDailyReviews(12, 0.9, false);
    expect(mid).toBeGreaterThan(RETENTION_LOAD[10]![0.9]!.meaning);
    expect(mid).toBeLessThan(RETENTION_LOAD[15]![0.9]!.meaning);
    // Ngoài bảng: theo tỉ lệ với mức gần nhất.
    expect(estimateDailyReviews(40, 0.9, false)).toBe(RETENTION_LOAD[20]![0.9]!.meaning * 2);
  });
});
