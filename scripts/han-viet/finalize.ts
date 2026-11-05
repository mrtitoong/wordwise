/**
 * Dựng bảng âm Hán Việt chính thức: âm máy gợi ý, chữ đã có người duyệt thì lấy theo người duyệt.
 *
 *   npx tsx scripts/han-viet/finalize.ts   → data/zh/han-viet.json, scripts/out/han-viet.sql
 *
 * Sửa một chữ: đổi trong data/zh/han-viet-decisions.json, chạy lại rồi áp file SQL lên cloud (ghi đè
 * theo chữ, chạy lại nhiều lần được).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Suggestion } from "./suggest";

export type Decision = { char: string; readings: string[]; status: "ok" | "edited" };
export type HanVietRow = {
  char: string;
  readings: { am: string; meaning_vi: string | null }[];
  reviewed: boolean;
};

/** Âm lặp gộp nghĩa; âm người duyệt thêm mới thì chưa có nghĩa. */
export function finalizeReadings(
  suggestions: readonly Suggestion[],
  decisions: readonly Decision[],
): HanVietRow[] {
  const decided = new Map(decisions.map((d) => [d.char, d]));
  return suggestions.map((s) => {
    const meanings = new Map<string, string>();
    for (const r of s.readings) {
      const seen = meanings.get(r.am);
      meanings.set(r.am, seen ? `${seen}; ${r.meaning_vi}` : r.meaning_vi);
    }
    const decision = decided.get(s.char);
    const sounds = decision ? [...new Set(decision.readings)] : [...meanings.keys()];
    return {
      char: s.char,
      readings: sounds.map((am) => ({ am, meaning_vi: meanings.get(am) ?? null })),
      reviewed: !!decision,
    };
  });
}

/** Câu lệnh ghi đè theo chữ. Chuỗi SQL thoát dấu nháy đơn nên nội dung nào cũng an toàn. */
export function toSql(rows: readonly HanVietRow[]): string {
  const json = JSON.stringify(rows).replaceAll("'", "''");
  return `insert into public.zh_han_viet (char, readings, reviewed)
select r.char, r.readings, r.reviewed
from jsonb_to_recordset('${json}'::jsonb) as r (char text, readings jsonb, reviewed boolean)
on conflict (char) do update set readings = excluded.readings, reviewed = excluded.reviewed;
`;
}

if (process.argv[1]?.endsWith("finalize.ts")) {
  const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
  const rows = finalizeReadings(
    read<Suggestion[]>("data/zh/han-viet-suggestions.json"),
    read<Decision[]>("data/zh/han-viet-decisions.json"),
  );
  writeFileSync("data/zh/han-viet.json", `${JSON.stringify(rows, null, 1)}\n`);
  mkdirSync("scripts/out", { recursive: true });
  writeFileSync("scripts/out/han-viet.sql", toSql(rows));
  const empty = rows.filter((r) => r.readings.length === 0).map((r) => r.char);
  const reviewed = rows.filter((r) => r.reviewed).length;
  console.log(
    `${rows.length} chữ, ${reviewed} có người duyệt, chưa có âm: ${empty.join(" ") || "không"}`,
  );
}
