import { describe, expect, it } from "vitest";
import { reasonsOf } from "./review";
import { charsToSuggest, compare, readCharList, type Suggestion } from "./suggest";

describe("đối chiếu Unihan", () => {
  const am = (value: string) => [{ am: value }];

  it("cách bỏ dấu khác nhau vẫn là một âm", () => {
    expect(compare(am("hòa"), ["hoà"])).toBe("khop");
    expect(compare(am("thủy"), ["thuỷ"])).toBe("khop");
    expect(compare(am("khóa"), ["khoá"])).toBe("khop");
  });

  it("khác âm thì lệch; Unihan không có thì thiếu", () => {
    expect(compare(am("môn"), ["món"])).toBe("lech");
    expect(compare(am("ái"), [])).toBe("thieu");
    expect(compare([], ["trảo"])).toBe("lech");
  });
});

describe("chọn chữ cần duyệt", () => {
  const item = (over: Partial<Suggestion>): Suggestion => ({
    char: "好",
    readings: [{ am: "hảo", meaning_vi: "tốt" }],
    confidence: 0.95,
    level: 1,
    traditional: [],
    unihan: ["hảo"],
    check: "khop",
    ...over,
  });

  it("khớp và chắc chắn thì không cần duyệt", () => {
    expect(reasonsOf(item({}), false)).toEqual([]);
  });

  it("máy không chắc, lặp âm, không có âm đều phải duyệt dù đã khớp", () => {
    expect(reasonsOf(item({ confidence: 0.5 }), false)).toEqual(["conf"]);
    expect(reasonsOf(item({}), true)).toEqual(["dup"]);
    expect(reasonsOf(item({ readings: [], unihan: ["quơ"] }), false)).toEqual(["none"]);
  });

  it("khác Unihan hoặc Unihan không có thì dùng âm máy, kể cả khi máy không chắc", () => {
    expect(reasonsOf(item({ unihan: ["món"], confidence: 0.5 }), true)).toEqual([]);
    expect(reasonsOf(item({ unihan: [], confidence: 0.5 }), true)).toEqual([]);
  });
});

describe("bảng chữ HSK", () => {
  it("chỉ lấy cấp 1–3", () => {
    const text = ["# ghi chú", "一级汉字表", "1\t爱", "二级汉字表", "1\t啊", "四级汉字表", "1\t熬"];
    expect(readCharList(text.join("\n"))).toEqual([
      { char: "爱", level: 1 },
      { char: "啊", level: 2 },
    ]);
  });

  it("đọc được cấp cao hơn, bỏ bảng chữ viết tay", () => {
    const text = ["四级汉字表", "1\t熬", "七一九级汉字表", "1\t蔼", "初等手写字表", "1\t爱"];
    expect(readCharList(text.join("\n"), 7)).toEqual([
      { char: "熬", level: 4 },
      { char: "蔼", level: 7 },
    ]);
  });

  it("chữ thêm lấy cấp theo bảng chữ, không có thì cấp 7, không lặp chữ cấp 1–3", () => {
    const text = ["一级汉字表", "1\t爱", "五级汉字表", "1\t岸"].join("\n");
    expect(charsToSuggest(text, "岸爱龘 x")).toEqual([
      { char: "爱", level: 1 },
      { char: "岸", level: 5 },
      { char: "龘", level: 7 },
    ]);
  });
});
