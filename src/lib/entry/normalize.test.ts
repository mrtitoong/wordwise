import { describe, expect, it } from "vitest";
import type { WordSummary } from "@/lib/words/api";
import { normalizeEntry, summarizeEntries, type Resolution } from "./normalize";
import { isMultiline, parsePastedText } from "./paste";

const word = (id: string, pos: WordSummary["pos"], senses: string[]): WordSummary => ({
  id,
  lemma: id,
  pos,
  cefr: "B1",
  senses: senses.map((meaning, i) => ({ id: `${id}-s${i}`, meaning_vi: meaning })),
});

const run: Resolution = {
  lemma: "run",
  alternatives: ["running"],
  words: [word("run-v", "verb", ["chạy", "điều hành"]), word("run-n", "noun", ["cuộc chạy"])],
};

describe("normalizeEntry", () => {
  it("đưa về từ gốc và báo đã đổi", () => {
    const e = normalizeEntry({ text: "  Running. " }, run, new Set());
    expect(e).toMatchObject({ surface: "running", lemma: "run", changed: true, status: "choose" });
    expect(e.alternatives).toEqual(["running"]);
  });

  it("nhiều nghĩa: mặc định nghĩa phổ biến nhất chưa có trong kho", () => {
    const e = normalizeEntry({ text: "run" }, run, new Set(["run-v-s0"]));
    expect(e.status).toBe("choose");
    if (e.status !== "choose") return;
    expect(e.senseId).toBe("run-v-s1");
    expect(e.options.map((o) => o.owned)).toEqual([true, false, false]);
  });

  it("mọi nghĩa đã có → trùng", () => {
    const e = normalizeEntry({ text: "run" }, run, new Set(["run-v-s0", "run-v-s1", "run-n-s0"]));
    expect(e.status).toBe("duplicate");
  });

  it("một nghĩa → thêm ngay; giữ ngữ cảnh và ghi chú (gọn khoảng trắng)", () => {
    const e = normalizeEntry(
      { text: "resilient", context: "  She is\n resilient. ", note: "kiên cường" },
      { lemma: "resilient", alternatives: [], words: [word("res", "adjective", ["kiên cường"])] },
      new Set(),
    );
    expect(e).toMatchObject({
      status: "ready",
      senseId: "res-s0",
      context: "She is resilient.",
      note: "kiên cường",
      changed: false,
    });
  });

  it("chưa có trong kho → new; chưa tra được → unresolved; rác → invalid", () => {
    expect(
      normalizeEntry(
        { text: "zygote" },
        { lemma: "zygote", alternatives: [], words: [] },
        new Set(),
      ).status,
    ).toBe("new");
    expect(normalizeEntry({ text: "zygote" }, null, new Set()).status).toBe("unresolved");
    expect(normalizeEntry({ text: "  ...  " }, null, new Set()).status).toBe("invalid");
    expect(normalizeEntry({ text: "12345" }, null, new Set()).status).toBe("invalid");
    expect(normalizeEntry({ text: "a".repeat(65) }, null, new Set()).status).toBe("invalid");
  });

  it("tóm tắt thêm hàng loạt theo số chỗ còn lại hôm nay", () => {
    const entries = [
      normalizeEntry({ text: "run" }, run, new Set()),
      normalizeEntry(
        { text: "zygote" },
        { lemma: "zygote", alternatives: [], words: [] },
        new Set(),
      ),
      normalizeEntry({ text: "run" }, run, new Set(["run-v-s0", "run-v-s1", "run-n-s0"])),
      normalizeEntry({ text: "!!" }, null, new Set()),
    ];
    expect(summarizeEntries(entries, 1)).toEqual({
      toAdd: 1,
      newWords: 1,
      today: 1,
      queued: 1,
      duplicates: 1,
      invalid: 1,
    });
  });
});

describe("parsePastedText", () => {
  it("bỏ gạch đầu dòng/số thứ tự, tách nghĩa, bỏ dòng trống và trùng", () => {
    const { lines, truncated } = parsePastedText(
      "1. resilient - kiên cường\n\n• Running\n- well-known\tnổi tiếng\nresilient\ngive up: từ bỏ\nsetback = trở ngại\n",
    );
    expect(truncated).toBe(false);
    expect(lines).toEqual([
      { word: "resilient", note: "kiên cường" },
      { word: "Running", note: null },
      { word: "well-known", note: "nổi tiếng" },
      { word: "give up", note: "từ bỏ" },
      { word: "setback", note: "trở ngại" },
    ]);
  });

  it("tối đa 200 dòng", () => {
    const text = Array.from({ length: 250 }, (_, i) => `word${i}`).join("\n");
    const { lines, truncated } = parsePastedText(text);
    expect(lines).toHaveLength(200);
    expect(truncated).toBe(true);
  });

  it("nhận biết dán nhiều dòng", () => {
    expect(isMultiline("run")).toBe(false);
    expect(isMultiline("run\n\n")).toBe(false);
    expect(isMultiline("run\r\nwalk")).toBe(true);
  });
});
