import { describe, expect, it } from "vitest";
import { WordContentSchema, wordContentJsonSchema, type WordContent } from "./word";
import run from "./examples/run.json";
import resilient from "./examples/resilient.json";

/** Bản sao sâu để mỗi test sửa dữ liệu mà không ảnh hưởng test khác. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function issuePaths(input: unknown): string[] {
  const result = WordContentSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join("."));
}

describe("WordContentSchema – ví dụ mẫu", () => {
  it.each([
    ["run", run],
    ["resilient", resilient],
  ])("%s hợp lệ", (_name, example) => {
    const result = WordContentSchema.safeParse(example);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("run có động từ bất quy tắc và 3 nghĩa", () => {
    const word: WordContent = WordContentSchema.parse(run);
    expect(word.senses).toHaveLength(3);
    expect(word.forms.inflections.find((f) => f.label === "past")).toMatchObject({
      form: "ran",
      irregular: true,
    });
  });

  it("resilient có nội dung cho đủ 5 tab", () => {
    const word = WordContentSchema.parse(resilient);
    const sense = word.senses[0]!;
    // Nghĩa
    expect(sense.meaning_vi).not.toBe("");
    expect(word.forms.inflections.length).toBeGreaterThan(0);
    // Ví dụ
    expect(sense.examples.length).toBeGreaterThan(0);
    // Cách dùng
    expect(sense.collocations.length).toBeGreaterThan(0);
    expect(sense.idioms.length).toBeGreaterThan(0);
    expect(sense.common_mistakes.length).toBeGreaterThan(0);
    // Từ liên quan
    expect(sense.synonyms.length + word.word_family.length).toBeGreaterThan(0);
    // Ghi nhớ
    expect(word.mnemonics.length + word.confusables.length).toBeGreaterThan(0);
  });
});

describe("WordContentSchema – từ chối dữ liệu sai", () => {
  it("thiếu senses", () => {
    const bad = clone(resilient) as Record<string, unknown>;
    bad.senses = [];
    expect(issuePaths(bad)).toContain("senses");
  });

  it("CEFR không hợp lệ", () => {
    const bad = { ...clone(resilient), cefr: "D1" };
    expect(issuePaths(bad)).toContain("cefr");
  });

  it("highlight không có trong câu ví dụ", () => {
    const bad = clone(run);
    bad.senses[0]!.examples[0]!.highlight = "walk";
    expect(issuePaths(bad)).toContain("senses.0.examples.0.highlight");
  });

  it("IPA kèm dấu /", () => {
    const bad = clone(resilient);
    bad.ipa.us = "/rɪˈzɪl.jənt/";
    expect(issuePaths(bad)).toContain("ipa.us");
  });

  it("tiếng Anh thiếu cả hai IPA", () => {
    const bad = clone(resilient) as Record<string, unknown>;
    bad.ipa = { us: null, uk: null };
    expect(issuePaths(bad)).toContain("ipa");
  });

  it("chuỗi rỗng hoặc chỉ có khoảng trắng", () => {
    const bad = clone(resilient);
    bad.senses[0]!.meaning_vi = "   ";
    expect(issuePaths(bad)).toContain("senses.0.meaning_vi");
  });

  it("register ngoài 5 nhãn", () => {
    const bad = clone(resilient);
    (bad.senses[0]!.idioms[0] as { register: string }).register = "casual";
    expect(issuePaths(bad)).toContain("senses.0.idioms.0.register");
  });

  it("language_extra không khớp language", () => {
    const bad = clone(resilient) as Record<string, unknown>;
    bad.language_extra = {
      kind: "zh",
      simplified: "坚韧",
      traditional: "堅韌",
      pinyin: "jiān rèn",
      tones: [1, 4],
      hsk: null,
    };
    expect(issuePaths(bad)).toContain("language_extra.kind");
  });

  it("quá 3 lỗi hay gặp cho một nghĩa", () => {
    const bad = clone(resilient);
    const mistake = bad.senses[0]!.common_mistakes[0]!;
    bad.senses[0]!.common_mistakes = [mistake, mistake, mistake, mistake];
    expect(issuePaths(bad)).toContain("senses.0.common_mistakes");
  });

  it("bỏ qua khóa lạ thay vì báo lỗi", () => {
    const extra = { ...clone(resilient), notes: "LLM tự thêm" };
    const parsed = WordContentSchema.parse(extra);
    expect(parsed).not.toHaveProperty("notes");
  });
});

describe("WordContentSchema – mở rộng ngôn ngữ", () => {
  it("chấp nhận tiếng Nhật có furigana", () => {
    const ja = {
      ...clone(resilient),
      language: "ja",
      lemma: "努力",
      pos: "noun",
      ipa: { us: null, uk: null },
      cefr: "A2",
      forms: { inflections: [], variants: [] },
      senses: [
        {
          definition_en: "effort; hard work",
          meaning_vi: "nỗ lực",
          image_query: "student studying late night",
          examples: [
            {
              sentence: "毎日努力しています。",
              translation_vi: "Ngày nào tôi cũng nỗ lực.",
              highlight: "努力",
            },
          ],
          synonyms: [],
          antonyms: [],
          collocations: [],
          idioms: [],
          common_mistakes: [],
        },
      ],
      word_family: [],
      language_extra: {
        kind: "ja",
        reading_kana: "どりょく",
        furigana: [{ text: "努力", reading: "どりょく" }],
        pitch_accent: 1,
        jlpt: "N4",
      },
    };
    expect(issuePaths(ja)).toEqual([]);
  });
});

describe("wordContentJsonSchema", () => {
  it("xuất được JSON Schema để đưa vào prompt LLM", () => {
    const schema = wordContentJsonSchema() as {
      type: string;
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(
      expect.arrayContaining(["lemma", "pos", "senses", "language_extra"]),
    );
    expect(Object.keys(schema.properties)).toContain("confusables");
  });
});
