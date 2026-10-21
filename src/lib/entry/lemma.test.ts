import { describe, expect, it } from "vitest";
import { cleanSurface, toLemma } from "./lemma";
import { englishLemmatizer } from "./lemmatizer-en";

const lemma = (input: string, pos: Parameters<typeof toLemma>[1]["pos"] = null) =>
  toLemma(input, { language: "en", pos, lemmatizer: englishLemmatizer });

describe("cleanSurface", () => {
  it("chữ thường, bỏ khoảng trắng thừa và dấu câu bao ngoài", () => {
    expect(cleanSurface("  Running!  ")).toBe("running");
    expect(cleanSurface("“Give   up”.")).toBe("give up");
    expect(cleanSurface("don’t")).toBe("don't");
    expect(cleanSurface("well-known")).toBe("well-known");
  });
});

describe("toLemma (tiếng Anh)", () => {
  it.each([
    ["running", "run"],
    ["children", "child"],
    ["gave", "give"],
    ["went", "go"],
    ["studies", "study"],
    ["mice", "mouse"],
    ["happier", "happy"],
    ["swimming", "swim"],
    ["run", "run"],
  ])("%s → %s", (input, expected) => {
    expect(lemma(input).lemma).toBe(expected);
  });

  it.each(["building", "glasses", "news", "interesting", "bored", "data", "clothes", "better"])(
    "giữ nguyên từ có nghĩa riêng: %s",
    (input) => {
      expect(lemma(input).lemma).toBe(input);
    },
  );

  it("đưa ra dạng gốc khác để người dùng chọn", () => {
    const result = lemma("leaves");
    expect(result.lemma).toBe("leave");
    expect(result.alternatives).toEqual(expect.arrayContaining(["leaf", "leaves"]));
    expect(lemma("building").alternatives).toContain("build");
  });

  it("theo loại từ khi được chỉ định", () => {
    expect(lemma("leaves", "noun").lemma).toBe("leaf");
    expect(lemma("building", "verb").lemma).toBe("build");
    expect(lemma("better", "adjective").lemma).toBe("good");
    expect(lemma("quickly", "adverb").lemma).toBe("quickly");
  });

  it("cụm động từ: chỉ chia lại động từ đầu cụm", () => {
    expect(lemma("Gave up").lemma).toBe("give up");
    expect(lemma("looking forward to", "phrasal_verb").lemma).toBe("look forward to");
    expect(lemma("ice cream", "noun").lemma).toBe("ice cream");
  });

  it("ngôn ngữ khác chỉ làm sạch", () => {
    expect(toLemma(" Bonjour ", { language: "fr", lemmatizer: englishLemmatizer }).lemma).toBe(
      "bonjour",
    );
  });
});
