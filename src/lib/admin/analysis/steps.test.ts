import { describe, expect, it } from "vitest";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import {
  blankCandidate,
  chunkDocument,
  clipContext,
  rawFromExtracted,
  rawFromRows,
} from "./extract";
import {
  applyLevelFilter,
  applyTriage,
  attachLibrary,
  dropDuplicates,
  lemmatize,
  mergeCandidates,
} from "./normalize";
import {
  frequencyKey,
  orderCandidates,
  separateConfusables,
  subtopicCount,
  subtopicsFromLlm,
  subtopicsFromTags,
} from "./order";
import { pickFromLlm, pickLocally, senseOptions } from "./senses";
import type { Candidate, LibraryWord } from "./types";
import { summarize, warningsFor } from "./warnings";

let seq = 0;
const newId = () => `c${++seq}`;

function cand(surface: string, patch: Partial<Candidate> = {}): Candidate {
  return { ...blankCandidate(newId(), patch.position ?? seq, surface), ...patch };
}

function word(lemma: string, patch: Partial<LibraryWord> = {}): LibraryWord {
  return {
    id: `w-${lemma}-${patch.pos ?? "noun"}`,
    lemma,
    pos: "noun",
    cefr: "B1",
    frequencyRank: null,
    senses: [{ id: `s-${lemma}-1`, definitionEn: `${lemma} def`, meaningVi: `nghĩa ${lemma}` }],
    family: [],
    confusables: [],
    confidence: null,
    ...patch,
  };
}

const library = (...words: LibraryWord[]) => {
  const map = new Map<string, LibraryWord[]>();
  for (const w of words) map.set(w.lemma, [...(map.get(w.lemma) ?? []), w]);
  return map;
};

/* ---------- Trích xuất ---------- */

describe("trích xuất", () => {
  it("bảng: cột nghĩa để chọn nghĩa, ví dụ thành câu ngữ cảnh, ghi chú, tag", () => {
    const [row] = rawFromRows(
      {
        id: "s1",
        kind: "rows",
        rows: [
          {
            word: "Bank",
            meaning: "ngân hàng",
            example: "I went to the bank.",
            note: "N1",
            tags: [" money "],
          },
        ],
      },
      7,
      newId,
    );
    expect(row).toMatchObject({
      stage: "raw",
      position: 7,
      surface: "Bank",
      meaningHint: "ngân hàng",
      contextSentence: "I went to the bank.",
      note: "N1",
      tags: ["money"],
    });
  });

  it("dán văn bản: phần sau dấu phân cách là nghĩa", () => {
    const rows = rawFromRows(
      {
        id: "s2",
        kind: "lines",
        rows: [
          { word: "cat", note: "con mèo" },
          { word: "dog", note: null },
        ],
      },
      0,
      newId,
    );
    expect(rows.map((r) => [r.position, r.meaningHint])).toEqual([
      [0, "con mèo"],
      [1, null],
    ]);
  });

  it("kết quả LLM của bài đọc giữ loại từ, CEFR, câu", () => {
    const [row] = rawFromExtracted(
      [{ text: "mitigate", pos: "verb", sentence: "We must mitigate risks.", cefr: "C1" }],
      3,
      newId,
    );
    expect(row).toMatchObject({
      position: 3,
      pos: "verb",
      cefr: "C1",
      contextSentence: "We must mitigate risks.",
    });
  });

  it("câu dài cắt quanh từ, không vượt 300 ký tự", () => {
    const sentence = `${"lorem ipsum ".repeat(40)}the crucial word appears here ${"dolor sit ".repeat(40)}`;
    const clipped = clipContext(sentence, "crucial")!;
    expect(clipped.length).toBeLessThanOrEqual(302);
    expect(clipped).toContain("crucial");
    expect(clipped.startsWith("…")).toBe(true);
  });

  it("chia bài đọc theo đoạn, đoạn quá dài theo câu", () => {
    const para = (n: number) => `Sentence ${n}. `.repeat(50).trim();
    const text = [para(1), para(2), para(3)].join("\n\n");
    const parts = chunkDocument(text, 1500);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1500)).toBe(true);
    expect(parts.join(" ")).toContain("Sentence 3.");
    expect(chunkDocument("  \n\n ")).toEqual([]);
    expect(chunkDocument("x".repeat(20), 8)).toEqual(["xxxxxxxx", "xxxxxxxx", "xxxx"]);
  });
});

/* ---------- Chuẩn hóa ---------- */

describe("chuẩn hóa", () => {
  const norm = (c: Candidate) => lemmatize(c, "en", englishLemmatizer);

  it("về từ gốc; chữ không hợp lệ bị loại", () => {
    expect(norm(cand("Running")).lemma).toBe("run");
    expect(norm(cand("gave up", { pos: "phrasal_verb" })).lemma).toBe("give up");
    expect(norm(cand("1234")).dropped).toBe("invalid");
    expect(norm(cand("one two three four five six seven")).dropped).toBe("invalid");
  });

  it("gộp trùng: giữ câu đầu tiên, gộp ghi chú/tag, cộng số lần", () => {
    const merged = mergeCandidates(
      [
        cand("children", { position: 0, note: "a", tags: ["t1"] }),
        cand("child", { position: 5, contextSentence: "A child.", note: "b", tags: ["t2"] }),
        cand("child", { position: 9, note: "a" }),
      ].map(norm),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      lemma: "child",
      position: 0,
      contextSentence: "A child.",
      note: "a · b",
      tags: ["t1", "t2"],
      occurrences: 3,
    });
  });

  it("dòng không ghi loại từ gộp vào dòng có loại từ nếu chỉ có một loại", () => {
    const merged = mergeCandidates(
      [cand("record", { position: 0 }), cand("record", { position: 1, pos: "verb" })].map(norm),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.pos).toBe("verb");
    const two = mergeCandidates(
      [
        cand("record", { position: 0 }),
        cand("record", { position: 1, pos: "verb" }),
        cand("record", { position: 2, pos: "noun" }),
      ].map(norm),
    );
    expect(two).toHaveLength(3);
  });

  it("tra kho: có từ thì gắn luôn; dạng trong nguồn có sẵn như từ riêng thì dùng dạng đó", () => {
    const lib = library(
      word("bank", { frequencyRank: 900, cefr: "A2" }),
      word("building", { id: "w-building" }),
    );
    expect(attachLibrary(norm(cand("banks")), lib)).toMatchObject({
      stage: "triaged",
      wordId: "w-bank-noun",
      cefr: "A2",
      frequencyRank: 900,
    });
    const building = attachLibrary(norm(cand("building")), lib);
    expect(building).toMatchObject({ lemma: "building", wordId: "w-building" });
    const missing = attachLibrary(norm(cand("zygote")), lib);
    expect(missing).toMatchObject({ stage: "merged", wordId: null });
    // Loại từ đã biết mà kho chỉ có loại khác → coi như chưa có.
    expect(attachLibrary(norm(cand("bank", { pos: "verb" })), lib).wordId).toBeNull();
  });

  it("xem trước: sửa chính tả (giữ chữ gốc), không phải từ thì loại", () => {
    const c = norm(cand("recieve"));
    const fixed = applyTriage(
      c,
      { key: c.id, valid: false, correction: "receive", cefr: "B1", rare: false },
      "en",
      englishLemmatizer,
    );
    expect(fixed).toMatchObject({
      lemma: "receive",
      spellingFrom: "recieve",
      cefr: "B1",
      stage: "triaged",
    });
    const junk = norm(cand("qwzx"));
    expect(
      applyTriage(
        junk,
        { key: junk.id, valid: false, correction: null, cefr: null, rare: false },
        "en",
        englishLemmatizer,
      ).dropped,
    ).toBe("not_a_word");
    const rare = norm(cand("susurrus"));
    expect(
      applyTriage(
        rare,
        { key: rare.id, valid: true, correction: null, cefr: "C2", rare: true },
        "en",
        englishLemmatizer,
      ),
    ).toMatchObject({ rare: true, cefr: "C2", dropped: null });
    // LLM bỏ sót mục → vẫn đi tiếp (không chặn cả danh sách).
    expect(applyTriage(rare, undefined, "en", englishLemmatizer).stage).toBe("triaged");
  });

  it("lọc theo trình độ; chưa rõ CEFR thì giữ", () => {
    expect(applyLevelFilter(cand("cat", { cefr: "A1" }), "B2").dropped).toBe("below_level");
    expect(applyLevelFilter(cand("mitigate", { cefr: "C1" }), "B2").dropped).toBeNull();
    expect(applyLevelFilter(cand("odd", { cefr: null }), "B2").dropped).toBeNull();
    expect(applyLevelFilter(cand("cat", { cefr: "A1" }), undefined).dropped).toBeNull();
  });

  it("sau khi sửa chính tả bị trùng: giữ dòng trước, dòng sau là duplicate", () => {
    const rows = dropDuplicates([
      cand("receive", { lemma: "receive", position: 0 }),
      cand("receive", { lemma: "receive", position: 3, spellingFrom: "recieve", tags: ["x"] }),
    ]);
    expect(rows.map((r) => r.dropped)).toEqual([null, "duplicate"]);
    expect(rows[0]).toMatchObject({ occurrences: 2, tags: ["x"] });
  });
});

/* ---------- Chọn nghĩa ---------- */

describe("chọn nghĩa", () => {
  const bank = word("bank", {
    senses: [
      { id: "s-bank-1", definitionEn: "financial institution", meaningVi: "ngân hàng" },
      { id: "s-bank-2", definitionEn: "side of a river", meaningVi: "bờ sông" },
    ],
  });

  it("một nghĩa → lấy luôn", () => {
    const c = cand("cat", { lemma: "cat", wordId: "w-cat-noun" });
    const pick = pickLocally(c, senseOptions(c, [word("cat")]));
    expect(pick).toMatchObject({ kind: "decided", method: "single", senseId: "s-cat-1" });
  });

  it("cột nghĩa của file chọn nghĩa khớp nhất", () => {
    const c = cand("bank", { lemma: "bank", wordId: bank.id, meaningHint: "bờ (sông)" });
    expect(pickLocally(c, senseOptions(c, [bank]))).toMatchObject({
      method: "meaning",
      senseId: "s-bank-2",
    });
  });

  it("có câu ngữ cảnh → cần LLM; không có → nghĩa phổ biến nhất", () => {
    const withContext = cand("bank", {
      lemma: "bank",
      wordId: bank.id,
      contextSentence: "We sat on the bank.",
    });
    const pick = pickLocally(withContext, senseOptions(withContext, [bank]));
    expect(pick.kind).toBe("llm");
    if (pick.kind === "llm") expect(pick.input.senses).toHaveLength(2);
    const bare = cand("bank", { lemma: "bank", wordId: bank.id });
    expect(pickLocally(bare, senseOptions(bare, [bank]))).toMatchObject({
      method: "default",
      senseId: "s-bank-1",
    });
  });

  it("không ghi loại từ: gộp nghĩa của mọi loại từ, từ đã gắn đứng đầu", () => {
    const noun = word("record", { id: "w-rec-n", frequencyRank: 500 });
    const verb = word("record", {
      id: "w-rec-v",
      pos: "verb",
      frequencyRank: 900,
      senses: [{ id: "s-rec-v", definitionEn: "to store", meaningVi: "ghi lại" }],
    });
    const c = cand("record", {
      lemma: "record",
      wordId: "w-rec-n",
      contextSentence: "Please record it.",
    });
    const options = senseOptions(c, [verb, noun]);
    expect(options.map((o) => o.wordId)).toEqual(["w-rec-n", "w-rec-v"]);
    expect(pickFromLlm(options, { key: c.id, n: 2, confidence: 0.9 })).toMatchObject({
      wordId: "w-rec-v",
      method: "context",
      confidence: 0.9,
    });
    // LLM trả số ngoài danh sách → nghĩa phổ biến nhất, không có độ tin cậy.
    expect(pickFromLlm(options, { key: c.id, n: 7, confidence: 0.9 })).toMatchObject({
      wordId: "w-rec-n",
      method: "default",
      confidence: null,
    });
    expect(pickLocally(c, [])).toEqual({ kind: "none" });
  });
});

/* ---------- Sắp xếp ---------- */

describe("sắp xếp", () => {
  it("số chủ đề con và chủ đề từ tag", () => {
    expect(subtopicCount(20)).toBe(2);
    expect(subtopicCount(500)).toBe(20);
    expect(subtopicCount(240)).toBe(10);
    const rows = [cand("a", { tags: ["Food"] }), cand("b", { tags: ["Travel", "x"] }), cand("c")];
    expect([...subtopicsFromTags(rows)!.values()]).toEqual(["Food", "Travel"]);
    expect(subtopicsFromTags([cand("a", { tags: ["x"] }), cand("b"), cand("c")])).toBeNull();
  });

  it("chủ đề từ LLM theo mã; mã sai bị bỏ qua", () => {
    const map = subtopicsFromLlm(["x", "y"], {
      topics: ["Ăn uống"],
      items: [
        { i: 0, t: 0 },
        { i: 1, t: 5 },
        { i: 9, t: 0 },
      ],
    });
    expect([...map.entries()]).toEqual([["x", "Ăn uống"]]);
  });

  it("thông dụng trước; thiếu tần suất thì theo CEFR; từ hiếm sau", () => {
    expect(frequencyKey(cand("a", { frequencyRank: 10 }))).toBeLessThan(
      frequencyKey(cand("b", { cefr: "A1" })),
    );
    expect(frequencyKey(cand("b", { cefr: "A2" }))).toBeLessThan(
      frequencyKey(cand("c", { cefr: "C1" })),
    );
    expect(frequencyKey(cand("d", { cefr: "A2", rare: true }))).toBeGreaterThan(
      frequencyKey(cand("e", { cefr: "C2" })),
    );
  });

  it("nhóm theo chủ đề con, từ cùng họ đứng cạnh nhau", () => {
    const rows = [
      cand("economy", {
        lemma: "economy",
        wordId: "w-economy",
        frequencyRank: 100,
        subtopic: "Kinh tế",
      }),
      cand("cat", { lemma: "cat", wordId: "w-cat", frequencyRank: 50, subtopic: "Động vật" }),
      cand("market", {
        lemma: "market",
        wordId: "w-market",
        frequencyRank: 120,
        subtopic: "Kinh tế",
      }),
      cand("economic", {
        lemma: "economic",
        wordId: "w-economic",
        frequencyRank: 300,
        subtopic: "Kinh tế",
      }),
      cand("dog", { lemma: "dog", wordId: "w-dog", frequencyRank: 60, subtopic: "Động vật" }),
      cand("misc", { lemma: "misc", wordId: "w-misc", frequencyRank: 1, subtopic: null }),
    ];
    const words = new Map([
      ["w-economy", word("economy", { id: "w-economy", family: ["economic", "economist"] })],
    ]);
    const ordered = orderCandidates(rows, words);
    expect(ordered.map((c) => c.lemma)).toEqual([
      "cat",
      "dog",
      "economy",
      "economic",
      "market",
      "misc",
    ]);
    expect(ordered.map((c) => c.itemOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("cặp dễ nhầm cách nhau ít nhất 10 vị trí", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      cand(`w${i}`, { lemma: `w${i}`, wordId: `id${i}` }),
    );
    rows[1] = cand("affect", { lemma: "affect", wordId: "id-affect" });
    rows[2] = cand("effect", { lemma: "effect", wordId: "id-effect" });
    const words = new Map([
      ["id-affect", word("affect", { id: "id-affect", confusables: ["effect"] })],
    ]);
    const out = separateConfusables(rows, words);
    const a = out.findIndex((c) => c.lemma === "affect");
    const e = out.findIndex((c) => c.lemma === "effect");
    expect(Math.abs(a - e)).toBeGreaterThanOrEqual(10);
    expect(out).toHaveLength(15);
    // Danh sách quá ngắn: tách xa nhất có thể, không lặp vô hạn.
    const short = separateConfusables(rows.slice(0, 4), words);
    expect(short.map((c) => c.lemma).at(-1)).toBe("effect");
  });
});

/* ---------- Cảnh báo ---------- */

describe("cảnh báo", () => {
  it("đủ các loại cảnh báo", () => {
    const w = word("bank", {
      cefr: "C2",
      confidence: 0.3,
      senses: [1, 2, 3].map((n) => ({ id: `s${n}`, definitionEn: "d", meaningVi: "m" })),
    });
    const codes = warningsFor(
      cand("bank", {
        lemma: "bank",
        spellingFrom: "bnak",
        senseMethod: "default",
        senseConfidence: 0.4,
      }),
      w,
      { targetCefr: "B2" },
    );
    expect(codes).toEqual([
      { code: "spelling", from: "bnak", to: "bank" },
      { code: "rare" },
      { code: "above_level", cefr: "C2", target: "B2" },
      { code: "many_senses", count: 3 },
      { code: "no_context" },
      { code: "low_confidence", source: "sense", value: 0.4 },
      { code: "low_confidence", source: "content", value: 0.3 },
    ]);
    expect(
      warningsFor(cand("cat", { lemma: "cat", senseMethod: "single" }), word("cat"), {
        targetCefr: null,
      }),
    ).toEqual([]);
  });

  it("tóm tắt: số mục, cảnh báo theo loại, lý do loại, từ mới, thời gian", () => {
    const rows = [
      cand("a", {
        senseId: "s1",
        warnings: [
          { code: "rare" },
          { code: "low_confidence", source: "sense", value: 0.1 },
          { code: "low_confidence", source: "content", value: 0.1 },
        ],
        jobCreated: true,
      }),
      cand("b", { senseId: "s2" }),
      cand("c", { senseId: "s2" }),
      cand("d", { dropped: "below_level" }),
      cand("e", { dropped: "not_a_word" }),
      cand("f", { dropped: "below_level" }),
    ];
    expect(summarize(rows, "2026-10-23T00:00:00Z", Date.parse("2026-10-23T00:05:30Z"))).toEqual({
      items: 2,
      withWarnings: 1,
      warnings: { rare: 1, low_confidence: 1 },
      dropped: { below_level: 2, not_a_word: 1 },
      newWords: 1,
      durationSeconds: 330,
    });
  });
});
