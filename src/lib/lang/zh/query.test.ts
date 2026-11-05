import { describe, expect, it, vi } from "vitest";
import { normalizeEntry } from "@/lib/entry/normalize";
import { reverseLookup } from "@/lib/words/reverse";
import { hasHan, matchesToneHint, pinyinSearchKey } from "./query";

describe("pinyinSearchKey", () => {
  it("đưa mọi cách viết pinyin về một khóa", () => {
    for (const typed of ["xuexiao", "xué xiào", "xue2xiao4", "XUE2 XIAO4", "xuéxiào"]) {
      expect(pinyinSearchKey(typed)).toBe("xuexiao");
    }
  });

  it("ü viết thành v", () => {
    expect(pinyinSearchKey("lǜ")).toBe("lv");
    expect(pinyinSearchKey("lü4")).toBe("lv");
  });

  it("chữ Hán và tiếng Việt có đ không phải pinyin", () => {
    expect(pinyinSearchKey("学校")).toBeNull();
    expect(pinyinSearchKey("đi")).toBeNull();
  });
});

describe("matchesToneHint", () => {
  it("không ghi thanh thì khớp mọi thanh", () => {
    expect(matchesToneHint("xuexiao", "xué xiào")).toBe(true);
    expect(matchesToneHint("xue", "xué xiào")).toBe(true);
  });

  it("có ghi thanh thì phải đúng thanh, dấu hay số đều được", () => {
    expect(matchesToneHint("xué", "xué xiào")).toBe(true);
    expect(matchesToneHint("xuē", "xué xiào")).toBe(false);
    expect(matchesToneHint("xue2xiao4", "xué xiào")).toBe(true);
    expect(matchesToneHint("xue1", "xué xiào")).toBe(false);
  });

  it("chỉ ghi thanh một phần vẫn khớp", () => {
    expect(matchesToneHint("xuexiào", "xué xiào")).toBe(true);
    expect(matchesToneHint("xue2xiao", "xué xiào")).toBe(true);
  });

  it("ü gõ bằng v", () => {
    expect(matchesToneHint("lv4", "lǜ")).toBe(true);
    expect(matchesToneHint("lv", "lǜ")).toBe(true);
  });

  it("dài hơn âm thì không khớp", () => {
    expect(matchesToneHint("xuexiaoa", "xué xiào")).toBe(false);
  });
});

describe("normalizeEntry với tiếng Trung", () => {
  const resolution = { lemma: "学校", alternatives: [], words: [] };

  it("dòng chỉ có pinyin hoặc chữ Latin là không hợp lệ", () => {
    expect(normalizeEntry({ text: "xuexiao" }, null, new Set(), "zh").status).toBe("invalid");
    expect(hasHan("xuexiao")).toBe(false);
  });

  it("chữ phồn thể đã đổi thì báo để người học thấy", () => {
    expect(normalizeEntry({ text: "學校" }, resolution, new Set(), "zh")).toMatchObject({
      status: "new",
      lemma: "学校",
      changed: true,
    });
  });

  it("tiếng Anh không đổi", () => {
    expect(normalizeEntry({ text: "school" }, null, new Set()).status).toBe("unresolved");
  });
});

describe("reverseLookup với tiếng Trung", () => {
  it("tìm và hỏi AI đúng ngôn ngữ; gợi ý không có chữ Hán bị bỏ", async () => {
    const searchByMeaning = vi.fn(async () => []);
    const suggest = vi.fn(async () => [
      { word: "银行", pos: "noun" as const, nuance_vi: "Ngân hàng nói chung." },
      { word: "bank", pos: "noun" as const, nuance_vi: "Sai ngôn ngữ." },
    ]);
    const result = await reverseLookup(
      { action: "reverse", query: "ngân hàng", language: "zh" },
      "user",
      { searchByMeaning, suggest, consumeUsage: async () => ({ allowed: true }) },
    );
    expect(searchByMeaning).toHaveBeenCalledWith("ngân hàng", "zh");
    expect(suggest).toHaveBeenCalledWith("ngân hàng", "zh");
    expect(result.items.map((item) => item.word)).toEqual(["银行"]);
  });
});
