import { describe, expect, it } from "vitest";
import { MAX_ENTRIES, clearSlowLog, formatSlowLog, readSlowLog, recordSlow } from "./slow-log";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("nhật ký chậm", () => {
  it("chỉ ghi khi vượt ngưỡng của từng loại", () => {
    const store = memoryStore();
    expect(recordSlow("freeze", 0, 1_000, undefined, store)).toBe(false);
    expect(recordSlow("freeze", 0, 2_000, "online", store)).toBe(true);
    expect(recordSlow("write", 0, 1_999, undefined, store)).toBe(false);
    expect(recordSlow("sync", 0, 12_345.6, "push", store)).toBe(true);
    expect(readSlowLog(store)).toEqual([
      { at: "1970-01-01T00:00:00.000Z", kind: "freeze", ms: 2_000, detail: "online" },
      { at: "1970-01-01T00:00:00.000Z", kind: "sync", ms: 12_346, detail: "push" },
    ]);
  });

  it("giữ tối đa MAX_ENTRIES dòng mới nhất; xóa được", () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_ENTRIES + 5; i++) recordSlow("write", i * 1000, 3_000, `${i}`, store);
    const entries = readSlowLog(store);
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(entries[0]!.detail).toBe("5");
    clearSlowLog(store);
    expect(readSlowLog(store)).toEqual([]);
  });

  it("dữ liệu hỏng hoặc không có bộ nhớ: không lỗi", () => {
    const store = memoryStore();
    store.setItem("ww_slow_log", "{oops");
    expect(readSlowLog(store)).toEqual([]);
    expect(recordSlow("freeze", 0, 5_000, undefined, null)).toBe(false);
  });

  it("dạng văn bản: thời điểm, loại, số giây, chi tiết", () => {
    expect(
      formatSlowLog([
        { at: "2026-10-27T06:00:00.000Z", kind: "write", ms: 54_000, detail: "review" },
        { at: "2026-10-27T06:01:00.000Z", kind: "freeze", ms: 1_600 },
      ]),
    ).toBe("2026-10-27T06:00:00.000Z write 54.0s review\n2026-10-27T06:01:00.000Z freeze 1.6s");
  });
});
