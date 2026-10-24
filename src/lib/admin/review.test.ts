import { describe, expect, it } from "vitest";
import { loadExampleWords } from "@/lib/schema/examples";
import type { WordContent } from "@/lib/schema/word";
import {
  adminSavePayload,
  filterItems,
  matchSenses,
  mergeRegeneratedTab,
  moveById,
  moveItem,
  NO_FILTER,
  parseWarnings,
  pendingIds,
  reviewProgress,
  subtopicsOf,
  type ReviewItem,
} from "./review";

const bank = loadExampleWords().find((w) => w.lemma === "bank")!;

function item(id: string, patch: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id,
    order: 0,
    senseId: `s-${id}`,
    wordId: `w-${id}`,
    lemma: id,
    pos: "noun",
    meaningVi: id,
    cefr: "B1",
    senseCount: 1,
    subtopic: null,
    contextSentence: null,
    warnings: [],
    accepted: false,
    ...patch,
  };
}

describe("parseWarnings", () => {
  it("giữ cảnh báo hợp lệ, bỏ mục lạ", () => {
    expect(
      parseWarnings([{ code: "rare" }, { code: "unknown" }, { code: "many_senses", count: 3 }, 5]),
    ).toEqual([{ code: "rare" }, { code: "many_senses", count: 3 }]);
    expect(parseWarnings(null)).toEqual([]);
  });
});

describe("lọc và tiến độ", () => {
  const items = [
    item("a", { warnings: [{ code: "rare" }], subtopic: "Food" }),
    item("b", { accepted: true, subtopic: "Food" }),
    item("c", { subtopic: "Travel" }),
  ];

  it("lọc chỉ có cảnh báo, chưa duyệt, theo chủ đề con", () => {
    expect(filterItems(items, { ...NO_FILTER, warningsOnly: true }).map((i) => i.id)).toEqual([
      "a",
    ]);
    expect(filterItems(items, { ...NO_FILTER, pendingOnly: true }).map((i) => i.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterItems(items, { ...NO_FILTER, subtopic: "Food" }).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
    expect(subtopicsOf(items)).toEqual(["Food", "Travel"]);
  });

  it("chỉ xuất bản được khi mọi mục đã chấp nhận", () => {
    expect(reviewProgress(items)).toEqual({
      total: 3,
      accepted: 1,
      pending: 2,
      withWarnings: 1,
      pendingClean: 1,
      canPublish: false,
    });
    expect(reviewProgress(items.map((i) => ({ ...i, accepted: true }))).canPublish).toBe(true);
    expect(reviewProgress([]).canPublish).toBe(false);
  });

  it("Duyệt tất: mọi mục chưa duyệt kể cả có cảnh báo, theo bộ lọc đang dùng", () => {
    expect(pendingIds(items)).toEqual(["a", "c"]);
    expect(pendingIds(filterItems(items, { ...NO_FILTER, subtopic: "Food" }))).toEqual(["a"]);
    expect(pendingIds(items.map((i) => ({ ...i, accepted: true })))).toEqual([]);
  });
});

describe("đổi thứ tự", () => {
  it("chuyển vị trí và kẹp trong khoảng hợp lệ", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("kéo thả theo id", () => {
    const list = [item("a"), item("b"), item("c")];
    expect(moveById(list, "c", "a").map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(moveById(list, "x", "a").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("adminSavePayload", () => {
  it("giữ id nghĩa và tách cột cho admin_save_word", () => {
    const payload = adminSavePayload(bank, ["s1", "s2"]);
    expect(payload.senses.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(payload.details.map((d) => d.sense_id)).toEqual(["s1", "s2"]);
    expect(payload.word.ipa_us).toBe(bank.ipa.us);
    expect(payload.word.details.mnemonics).toEqual(bank.mnemonics);
    expect(payload.senses[0]).not.toHaveProperty("word_id");
  });

  it("báo lỗi khi số nghĩa khác hoặc nội dung sai schema", () => {
    expect(() => adminSavePayload(bank, ["s1"])).toThrow();
    const broken = { ...bank, senses: [{ ...bank.senses[0]!, meaning_vi: "" }, bank.senses[1]!] };
    expect(() => adminSavePayload(broken, ["s1", "s2"])).toThrow();
  });
});

describe("tạo lại một tab", () => {
  // Bản mới: đảo thứ tự nghĩa, nội dung khác để thấy phần nào được lấy.
  const generated: WordContent = {
    ...bank,
    ipa: { us: "bæŋk", uk: "bæŋk" },
    mnemonics: [{ type: "story", text_vi: "mẹo mới" }],
    senses: [
      {
        ...bank.senses[1]!,
        meaning_vi: "bờ sông (mới)",
        examples: [{ sentence: "We sat on the bank.", translation_vi: "x", highlight: "bank" }],
      },
      {
        ...bank.senses[0]!,
        meaning_vi: "ngân hàng (mới)",
        examples: [{ sentence: "The bank is open.", translation_vi: "y", highlight: "bank" }],
      },
    ],
  };

  it("ghép nghĩa theo nội dung, không theo vị trí", () => {
    expect(matchSenses(bank.senses, generated.senses)).toEqual([1, 0]);
    expect(matchSenses(bank.senses, generated.senses.slice(0, 1))).toEqual([null, 0]);
  });

  it("tab Ví dụ chỉ thay câu ví dụ của từng nghĩa", () => {
    const merged = mergeRegeneratedTab(bank, generated, "examples");
    expect(merged.senses[0]!.examples[0]!.sentence).toBe("The bank is open.");
    expect(merged.senses[1]!.examples[0]!.sentence).toBe("We sat on the bank.");
    expect(merged.senses[0]!.meaning_vi).toBe(bank.senses[0]!.meaning_vi);
    expect(merged.ipa).toEqual(bank.ipa);
    expect(merged.mnemonics).toEqual(bank.mnemonics);
  });

  it("tab Nghĩa thay nghĩa và đầu thẻ; tab Ghi nhớ thay phần cấp từ", () => {
    const meaning = mergeRegeneratedTab(bank, generated, "meaning");
    expect(meaning.senses.map((s) => s.meaning_vi)).toEqual(["ngân hàng (mới)", "bờ sông (mới)"]);
    expect(meaning.ipa).toEqual({ us: "bæŋk", uk: "bæŋk" });
    expect(meaning.senses[0]!.examples).toEqual(bank.senses[0]!.examples);

    const memory = mergeRegeneratedTab(bank, generated, "memory");
    expect(memory.mnemonics).toEqual([{ type: "story", text_vi: "mẹo mới" }]);
    expect(memory.senses).toEqual(bank.senses);
  });

  it("nghĩa không ghép được giữ nội dung cũ, số nghĩa không đổi", () => {
    const merged = mergeRegeneratedTab(
      bank,
      { ...generated, senses: generated.senses.slice(1) },
      "examples",
    );
    expect(merged.senses).toHaveLength(2);
    expect(merged.senses[1]!.examples).toEqual(bank.senses[1]!.examples);
  });
});
