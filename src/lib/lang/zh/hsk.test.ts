import { describe, expect, it } from "vitest";
import { parseHskEntry, parseHskList } from "./hsk";

describe("parseHskEntry", () => {
  it.each([
    ["爱", { word: "爱", pos: null, example: null }],
    ["爸爸｜爸", { word: "爸爸", pos: null, example: null }],
    ["好（形）", { word: "好", pos: "adjective", example: null }],
    ["分（名、量）", { word: "分", pos: "noun", example: null }],
    ["把（量）", { word: "把", pos: "classifier", example: null }],
    ["称¹（动）", { word: "称", pos: "verb", example: null }],
    ["家（科学家）", { word: "家", pos: null, example: "科学家" }],
    ["第（第二）", { word: "第", pos: null, example: "第二" }],
    ["有（一）些", { word: "有些", pos: null, example: null }],
    ["好（不）容易", { word: "好容易", pos: null, example: null }],
    ["茅台（酒）", { word: "茅台酒", pos: null, example: null }],
    ["…极了", { word: "极了", pos: null, example: null }],
    ["…分之…", { word: "分之", pos: null, example: null }],
    ["零｜〇", { word: "零", pos: null, example: null }],
  ])("%s", (raw, expected) => {
    expect(parseHskEntry(raw)).toEqual(expected);
  });
});

describe("parseHskList", () => {
  it("theo cấp, bỏ dòng chú thích", () => {
    const text = "# ghi chú\n\n一级词汇表\n1 爱\n2 好（形）\n二级词汇表\n1 好（副）\n";
    expect(parseHskList(text).map((e) => [e.level, e.word, e.pos])).toEqual([
      [1, "爱", null],
      [1, "好", "adjective"],
      [2, "好", "adverb"],
    ]);
  });

  it("bỏ cấp sau cấp 3", () => {
    expect(parseHskList("四级词汇表\n1 爱\n")).toEqual([]);
  });
});
