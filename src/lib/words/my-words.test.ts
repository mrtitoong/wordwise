import { describe, expect, it } from "vitest";
import type { UserWordRow, WordRow, WordSenseRow } from "@/lib/db/types";
import { listMyWords } from "./my-words";

const word = (id: string, lemma: string) => ({ id, lemma, pos: "noun" }) as WordRow;
const sense = (id: string, wordId: string, order: number, meaning: string) =>
  ({ id, word_id: wordId, sense_order: order, meaning_vi: meaning }) as WordSenseRow;
const uw = (senseId: string, addedAt: string, patch: Partial<UserWordRow> = {}) =>
  ({
    id: `uw-${senseId}`,
    sense_id: senseId,
    added_at: addedAt,
    deleted_at: null,
    custom_meaning: null,
    ...patch,
  }) as UserWordRow;

describe("listMyWords", () => {
  const words = new Map([
    ["w1", word("w1", "bank")],
    ["w2", word("w2", "run")],
  ]);
  const senses = new Map([
    ["s1a", sense("s1a", "w1", 0, "ngân hàng")],
    ["s1b", sense("s1b", "w1", 1, "bờ sông")],
    ["s2", sense("s2", "w2", 0, "chạy")],
  ]);

  it("mỗi từ một dòng, nghĩa đầu tiên người dùng có, mới thêm trước", () => {
    const list = listMyWords(
      [
        uw("s1b", "2026-10-02"),
        uw("s2", "2026-10-03"),
        uw("s1a", "2026-10-01", { custom_meaning: "nhà băng" }),
      ],
      senses,
      words,
    );
    expect(list).toEqual([
      { wordId: "w2", lemma: "run", pos: "noun", meaning: "chạy", addedAt: "2026-10-03" },
      { wordId: "w1", lemma: "bank", pos: "noun", meaning: "nhà băng", addedAt: "2026-10-02" },
    ]);
  });

  it("bỏ từ đã xóa và từ chưa có nội dung trong máy", () => {
    const list = listMyWords(
      [uw("s2", "2026-10-03", { deleted_at: "2026-10-04" }), uw("missing", "2026-10-05")],
      senses,
      words,
    );
    expect(list).toEqual([]);
  });
});
