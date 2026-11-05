/**
 * Dựng trang duyệt âm Hán Việt từ data/zh/han-viet-suggestions.json.
 *
 *   npx tsx scripts/han-viet/review.ts   → scripts/out/han-viet.html
 *
 * Âm lặp được gộp. Chữ khác Unihan hoặc Unihan không có thì dùng âm máy gợi ý, không duyệt (chốt
 * 2026-11-04: Unihan lẫn âm Nôm). Chữ cần duyệt là chữ khớp nhưng máy không chắc hoặc lặp âm, và chữ
 * chưa có âm.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { compare, type Suggestion } from "./suggest";

const LOW_CONFIDENCE = 0.8;

export function reasonsOf(s: Suggestion, duplicated: boolean): string[] {
  if (s.readings.length === 0) return ["none"];
  const check = compare(s.readings, s.unihan);
  if (check !== "khop") return [];
  return [...(s.confidence < LOW_CONFIDENCE ? ["conf"] : []), ...(duplicated ? ["dup"] : [])];
}

if (process.argv[1]?.endsWith("review.ts")) {
  const list = JSON.parse(
    readFileSync("data/zh/han-viet-suggestions.json", "utf8"),
  ) as Suggestion[];
  const chars = list.map((s) => {
    const seen = new Map<string, string>();
    for (const r of s.readings) {
      seen.set(r.am, seen.has(r.am) ? `${seen.get(r.am)}; ${r.meaning_vi}` : r.meaning_vi);
    }
    const readings = [...seen].map(([am, meaning_vi]) => ({ am, meaning_vi }));
    return {
      char: s.char,
      level: s.level,
      traditional: s.traditional,
      unihan: s.unihan,
      readings,
      reasons: reasonsOf(s, readings.length !== s.readings.length),
    };
  });
  const data = JSON.stringify(chars).replaceAll("</", "<\\/");
  const html = readFileSync("scripts/han-viet/review.template.html", "utf8").replace(
    "/*DATA*/[]",
    () => data,
  );
  writeFileSync("scripts/out/han-viet.html", html);
  const need = chars.filter((c) => c.reasons.length > 0).length;
  console.log(`${chars.length} chữ, cần duyệt ${need}, ${Math.round(html.length / 1024)} KB`);
}
