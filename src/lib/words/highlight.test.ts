import { describe, expect, it } from "vitest";
import { containsWordForm, splitHighlight, wordForms } from "./highlight";

const hits = (sentence: string, terms: string[]) =>
  splitHighlight(sentence, terms)
    .filter((s) => s.hit)
    .map((s) => s.text);

describe("splitHighlight", () => {
  it("tô theo ranh giới từ, không tô giữa từ", () => {
    expect(hits("Start the art class.", ["art"])).toEqual(["art"]);
    expect(hits("Restart now.", ["art"])).toEqual([]);
    expect(hits("He ran; she ran too.", ["ran"])).toEqual(["ran", "ran"]);
  });

  it("không phân biệt hoa thường, giữ nguyên chữ gốc", () => {
    expect(hits("Resilient people bounce back.", ["resilient"])).toEqual(["Resilient"]);
  });

  it("ưu tiên cụm dài hơn (phrasal verb)", () => {
    expect(hits("Do not give up now.", ["give", "give up"])).toEqual(["give up"]);
  });

  it("ghép lại đúng câu gốc; dấu nháy không phải ranh giới", () => {
    const sentence = "The bank's banks bank on it.";
    const joined = splitHighlight(sentence, ["bank", "banks"])
      .map((s) => s.text)
      .join("");
    expect(joined).toBe(sentence);
    expect(hits(sentence, ["bank", "banks"])).toEqual(["banks", "bank"]);
  });

  it("chữ có dấu không bị coi là ranh giới", () => {
    expect(hits("café cafe", ["caf"])).toEqual([]);
  });

  it("không có từ khóa → một đoạn", () => {
    expect(splitHighlight("Hello", [])).toEqual([{ text: "Hello", hit: false }]);
    expect(splitHighlight("", ["x"])).toEqual([]);
  });

  it("ký tự đặc biệt trong từ khóa không làm hỏng regex", () => {
    expect(hits("Use (a+b) daily.", ["a+b"])).toEqual(["a+b"]);
    expect(hits("Price: $5 today", ["$5"])).toEqual(["$5"]);
  });
});

describe("wordForms / containsWordForm", () => {
  it("sinh dạng thường gặp", () => {
    expect(wordForms("make")).toContain("making");
    expect(wordForms("study")).toEqual(expect.arrayContaining(["studies", "studied"]));
    expect(wordForms("give up", ["gave up", "given up"])).toEqual(
      expect.arrayContaining(["gives up", "giving up", "gave up"]),
    );
  });

  it("nhận câu chứa dạng bất quy tắc nếu biết", () => {
    expect(containsWordForm("She ran home.", "run", ["ran", "run"])).toBe(true);
    expect(containsWordForm("She went home.", "run", ["ran"])).toBe(false);
    expect(containsWordForm("My grandma is so resilient!", "resilient")).toBe(true);
  });
});
