import { describe, expect, it } from "vitest";
import { finalizeReadings, toSql } from "./finalize";
import type { Suggestion } from "./suggest";

const suggestion = (char: string, ...readings: [string, string][]) =>
  ({
    char,
    readings: readings.map(([am, meaning_vi]) => ({ am, meaning_vi })),
  }) as Suggestion;

describe("finalizeReadings", () => {
  it("chữ chưa duyệt dùng âm máy, âm lặp gộp nghĩa", () => {
    expect(finalizeReadings([suggestion("都", ["đô", "kinh đô"], ["đô", "đều"])], [])).toEqual([
      { char: "都", readings: [{ am: "đô", meaning_vi: "kinh đô; đều" }], reviewed: false },
    ]);
  });

  it("chữ đã duyệt theo âm và thứ tự của người duyệt, giữ nghĩa của âm còn lại", () => {
    const rows = finalizeReadings(
      [suggestion("还", ["hoàn", "trả lại"], ["hườn", "còn"])],
      [{ char: "还", readings: ["toàn", "hoàn"], status: "edited" }],
    );
    expect(rows).toEqual([
      {
        char: "还",
        readings: [
          { am: "toàn", meaning_vi: null },
          { am: "hoàn", meaning_vi: "trả lại" },
        ],
        reviewed: true,
      },
    ]);
  });

  it("người duyệt xóa trống thì chữ không có âm", () => {
    const rows = finalizeReadings(
      [suggestion("个", ["cá", "cái"])],
      [{ char: "个", readings: [], status: "edited" }],
    );
    expect(rows[0]).toEqual({ char: "个", readings: [], reviewed: true });
  });
});

describe("toSql", () => {
  it("ghi đè theo chữ và thoát dấu nháy đơn", () => {
    const sql = toSql([
      { char: "好", readings: [{ am: "hảo", meaning_vi: "it's good" }], reviewed: true },
    ]);
    expect(sql).toContain("on conflict (char) do update");
    expect(sql).toContain('"am":"hảo"');
    expect(sql).toContain("it''s good");
  });
});
