import { describe, expect, it } from "vitest";
import { candidateText, lookupTerms, type WordInfo } from "@/lib/ocr/pick";
import {
  ARTICLE_MAX_TOKENS,
  PRESELECT_MAX,
  SUGGEST_MAX,
  articleDocument,
  suggestWords,
} from "./suggest";

const TEXT =
  "Floods test how resilient a town is. Resilient towns recover because neighbours cooperate.\n\n" +
  "The council published a comprehensive assessment of drainage. Officials said the town was ready.";

const CEFR: Record<string, string | null> = {
  flood: "B1",
  test: "A2",
  town: "A1",
  resilient: "C1",
  recover: "B2",
  neighbour: "B1",
  cooperate: "B2",
  council: "B2",
  publish: "B1",
  comprehensive: "C1",
  assessment: "C1",
  drainage: null,
  official: "B1",
  say: "A1",
  ready: "A1",
};
const LEMMA: Record<string, string> = {
  floods: "flood",
  towns: "town",
  neighbours: "neighbour",
  published: "publish",
  officials: "official",
  said: "say",
};

function info(owned: string[] = []): Map<string, WordInfo> {
  const doc = articleDocument(TEXT);
  return new Map(
    lookupTerms(doc).map((term) => {
      const lemma = LEMMA[term] ?? term;
      return [
        term,
        {
          lemma,
          inLibrary: lemma in CEFR && CEFR[lemma] !== null,
          cefr: CEFR[lemma] ?? null,
          owned: owned.includes(lemma),
        },
      ];
    }),
  );
}

describe("suggestWords", () => {
  it("gợi ý từ từ trình độ trở lên, theo thứ tự trong bài, đếm số lần xuất hiện", () => {
    const doc = articleDocument(TEXT);
    const { suggestions, preselected } = suggestWords(doc, info(), "B1");
    const lemmas = suggestions.map((s) => s.lemma);
    // Bỏ từ dễ hơn B1 (test, town, say, ready); giữ từ B1 trở lên và từ ngoài kho.
    expect(lemmas).toEqual([
      "flood",
      "resilient",
      "recover",
      "neighbour",
      "cooperate",
      "council",
      "publish",
      "comprehensive",
      "assessment",
      "drainage",
      "official",
    ]);
    expect(suggestions.find((s) => s.lemma === "resilient")!.count).toBe(2);
    expect(suggestions.find((s) => s.lemma === "drainage")!.inLibrary).toBe(false);
    // Tích sẵn = các gợi ý (bài ngắn, chưa tới giới hạn 15).
    expect(preselected).toEqual(suggestions.map((s) => s.index));
    expect(candidateText(doc.tokens[suggestions[1]!.index]!.text)).toBe("resilient");
  });

  it("tích sẵn tối đa 15 từ khó nhất trong tối đa 40 gợi ý", () => {
    const alpha = (i: number) => String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26));
    const words = Array.from({ length: 50 }, (_, i) => `zq${alpha(i)}`);
    const doc = articleDocument(words.map((w) => `${w} stays.`).join(" "));
    const levels = ["B1", "B2", "C1", "C2"];
    const map = new Map<string, WordInfo>(
      words.map((w, i) => [w, { lemma: w, inLibrary: true, cefr: levels[i % 4]!, owned: false }]),
    );
    map.set("stays", { lemma: "stay", inLibrary: true, cefr: "A1", owned: false });
    const { suggestions, preselected } = suggestWords(doc, map, "B1");
    expect(suggestions).toHaveLength(SUGGEST_MAX);
    expect(preselected).toHaveLength(PRESELECT_MAX);
    const cefrOf = (index: number) => map.get(doc.tokens[index]!.text)!.cefr;
    expect(preselected.every((i) => cefrOf(i) === "C2" || cefrOf(i) === "C1")).toBe(true);
    expect(preselected.every((i) => suggestions.some((s) => s.index === i))).toBe(true);
  });

  it("bỏ từ người dùng đã có", () => {
    const { suggestions } = suggestWords(articleDocument(TEXT), info(["resilient"]), "B1");
    expect(suggestions.map((s) => s.lemma)).not.toContain("resilient");
  });

  it("bài quá dài thì dừng ở giới hạn token", () => {
    const long = Array.from({ length: 4000 }, () => "Resilient towns recover.").join(" ");
    expect(articleDocument(long).tokens.length).toBe(ARTICLE_MAX_TOKENS);
  });
});
