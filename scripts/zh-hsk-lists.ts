/**
 * Sinh SQL tạo nguồn cho 3 danh sách HSK (Z5c) từ wordlist.txt của elkmovie/hsk30. Danh sách và file SQL
 * không commit: quyền của danh sách chưa rõ (docs/plan-zh.md §3 điểm 4).
 *
 *   npx tsx scripts/zh-hsk-lists.ts <wordlist.txt> <thư mục new-1..3.json> <file ra>
 *
 * new-N.json (drkameleon/complete-hsk-vocabulary) chỉ dùng trường q để xếp từ thông dụng trước;
 * không lấy nghĩa (có phần của CC-CEDICT).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseHskList } from "@/lib/lang/zh/hsk";

const [listPath, rankDir, outPath] = process.argv.slice(2);
if (!listPath || !rankDir || !outPath) throw new Error("Thiếu tham số");

const rank = new Map<string, number>();
for (const level of [1, 2, 3]) {
  const items = JSON.parse(readFileSync(`${rankDir}/new-${level}.json`, "utf8")) as {
    s: string;
    q: number;
  }[];
  for (const item of items) rank.set(item.s, item.q);
}

const entries = parseHskList(readFileSync(listPath, "utf8"));
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const statements: string[] = [];

for (const level of [1, 2, 3]) {
  const rows = entries
    .filter((entry) => entry.level === level)
    .sort((a, b) => (rank.get(a.word) ?? Infinity) - (rank.get(b.word) ?? Infinity))
    .map(({ word, pos, example }) => ({ word, pos, example, meaning: null, note: null, tags: [] }));
  console.log(`Cấp ${level}: ${rows.length} mục`);
  statements.push(
    `insert into public.curated_list_sources (list_id, kind, name, content, item_count)
select id, 'rows', 'HSK 3.0 cấp ${level}', ${quote(JSON.stringify(rows))}::jsonb, ${rows.length}
from public.curated_lists where language = 'zh' and title = 'Từ vựng theo cấp HSK 3.0 – Cấp ${level}';`,
  );
}
writeFileSync(outPath, statements.join("\n\n") + "\n");
