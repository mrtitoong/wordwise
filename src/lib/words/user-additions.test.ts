import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS_PER_LAYER,
  addAddition,
  emptyAdditions,
  parseUserAdditions,
  removeAddition,
  serializeAdditions,
  updateAddition,
} from "./user-additions";

describe("parseUserAdditions", () => {
  it("dữ liệu rỗng hoặc sai kiểu → các tab rỗng", () => {
    expect(parseUserAdditions(null)).toEqual(emptyAdditions());
    expect(parseUserAdditions({})).toEqual(emptyAdditions());
    expect(parseUserAdditions([1, 2])).toEqual(emptyAdditions());
    expect(parseUserAdditions("x")).toEqual(emptyAdditions());
  });

  it("bỏ mục hỏng, giữ mục đúng, bỏ khóa lạ", () => {
    const parsed = parseUserAdditions({
      examples: [
        { id: "a", sentence: "I run daily.", translation_vi: "Tôi chạy hằng ngày." },
        { id: "b", sentence: "" },
        "rác",
      ],
      memory: [{ id: "m", text: "  mẹo  ", extra: 1 }],
      notes: [{ id: "x", text: "khóa cũ không dùng" }],
    });
    expect(parsed.examples).toEqual([
      { id: "a", sentence: "I run daily.", translation_vi: "Tôi chạy hằng ngày." },
    ]);
    expect(parsed.memory).toEqual([{ id: "m", text: "mẹo" }]);
    expect(parsed.meaning).toEqual([]);
  });

  it("bản dịch rỗng thành null", () => {
    const parsed = parseUserAdditions({
      examples: [{ id: "a", sentence: "Run!", translation_vi: "  " }],
    });
    expect(parsed.examples[0]!.translation_vi).toBeNull();
  });
});

describe("thêm / sửa / xóa", () => {
  it("thêm câu ví dụ, không đổi object cũ", () => {
    const before = emptyAdditions();
    const result = addAddition(before, "examples", { sentence: " She runs fast. " }, "id1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.additions.examples).toEqual([
      { id: "id1", sentence: "She runs fast.", translation_vi: null },
    ]);
    expect(before.examples).toEqual([]);
  });

  it("nội dung rỗng hoặc quá dài → invalid", () => {
    expect(addAddition(emptyAdditions(), "memory", { text: "   " }, "x")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(addAddition(emptyAdditions(), "related", { word: "a".repeat(65) }, "x")).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it(`tối đa ${MAX_ITEMS_PER_LAYER} mục mỗi tab`, () => {
    let additions = emptyAdditions();
    for (let i = 0; i < MAX_ITEMS_PER_LAYER; i++) {
      const r = addAddition(additions, "usage", { phrase: `p${i}` }, `id${i}`);
      if (!r.ok) throw new Error("không thêm được");
      additions = r.additions;
    }
    expect(addAddition(additions, "usage", { phrase: "thừa" }, "x")).toEqual({
      ok: false,
      error: "too_many",
    });
  });

  it("sửa giữ nguyên vị trí và id", () => {
    const a = addAddition(emptyAdditions(), "usage", { phrase: "one" }, "1");
    const b = a.ok ? addAddition(a.additions, "usage", { phrase: "two" }, "2") : a;
    if (!b.ok) throw new Error();
    const updated = updateAddition(b.additions, "usage", "1", { phrase: "uno", note: "ghi chú" });
    expect(updated.ok && updated.additions.usage).toEqual([
      { id: "1", phrase: "uno", note: "ghi chú" },
      { id: "2", phrase: "two", note: null },
    ]);
    expect(updateAddition(b.additions, "usage", "khong-co", { phrase: "x" })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("xóa", () => {
    const a = addAddition(emptyAdditions(), "meaning", { text: "ghi chú" }, "1");
    if (!a.ok) throw new Error();
    const removed = removeAddition(a.additions, "meaning", "1");
    expect(removed.ok && removed.additions.meaning).toEqual([]);
    expect(removeAddition(a.additions, "memory", "1")).toEqual({ ok: false, error: "not_found" });
  });

  it("serialize bỏ tab rỗng và đọc lại được", () => {
    const a = addAddition(emptyAdditions(), "memory", { text: "mẹo" }, "1");
    if (!a.ok) throw new Error();
    const json = serializeAdditions(a.additions);
    expect(json).toEqual({ memory: [{ id: "1", text: "mẹo" }] });
    expect(parseUserAdditions(json)).toEqual(a.additions);
  });
});
