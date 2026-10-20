import { describe, expect, it } from "vitest";
import { WordContentSchema } from "./word";
import { fromWordRows, toWordRows } from "./word-rows";
import { loadExampleWords } from "./examples";

const ids = {
  wordId: "00000000-0000-4000-8000-000000000001",
  senseId: (i: number) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
  generatedBy: "seed",
};

describe("toWordRows / fromWordRows", () => {
  it.each(loadExampleWords().map((w) => [w.lemma, w] as const))(
    "%s: chuyển sang dòng database rồi ghép lại giữ nguyên nội dung",
    (_lemma, content) => {
      const rows = toWordRows(content, ids);
      expect(rows.senses).toHaveLength(content.senses.length);
      expect(rows.details).toHaveLength(content.senses.length);
      expect(fromWordRows(rows)).toEqual(content);
    },
  );

  it("đặt dữ liệu cấp từ vào words.details, dữ liệu theo nghĩa vào word_details", () => {
    const [resilient] = loadExampleWords().filter((w) => w.lemma === "resilient");
    const rows = toWordRows(resilient!, ids);
    expect(rows.word.details.mnemonics.length).toBeGreaterThan(0);
    expect(rows.word.generated_by).toBe("seed");
    expect(rows.word.reviewed).toBe(false);
    expect(rows.details[0]!.common_mistakes.length).toBeGreaterThan(0);
    expect(rows.senses.map((s) => s.sense_order)).toEqual([0, 1]);
  });

  it("ghép lại theo đúng thứ tự nghĩa dù database trả về lộn xộn", () => {
    const [run] = loadExampleWords().filter((w) => w.lemma === "run");
    const rows = toWordRows(run!, ids);
    const shuffled = { ...rows, senses: [...rows.senses].reverse() };
    expect(fromWordRows(shuffled).senses[0]!.meaning_vi).toBe("chạy");
  });

  it("báo lỗi khi JSONB trong database sai schema", () => {
    const [run] = loadExampleWords().filter((w) => w.lemma === "run");
    const rows = toWordRows(run!, ids);
    const broken = {
      ...rows,
      details: rows.details.map((d, i) => (i === 0 ? { ...d, examples: [{ sentence: "x" }] } : d)),
    };
    expect(() => fromWordRows(broken)).toThrow();
  });

  it("báo lỗi khi thiếu word_details của một nghĩa", () => {
    const [run] = loadExampleWords().filter((w) => w.lemma === "run");
    const rows = toWordRows(run!, ids);
    expect(() => fromWordRows({ ...rows, details: rows.details.slice(1) })).toThrow(
      /Thiếu word_details/,
    );
  });

  it("mọi từ mẫu đều hợp lệ theo schema", () => {
    for (const word of loadExampleWords()) {
      expect(WordContentSchema.safeParse(word).success).toBe(true);
    }
  });
});
