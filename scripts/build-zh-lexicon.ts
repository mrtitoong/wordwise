/**
 * Sinh data/zh/lexicon.tsv từ file CC-CEDICT: chỉ giữ giản thể, phồn thể, pinyin và một cờ thông
 * dụng. Không giữ định nghĩa (docs/plan-zh.md §3 điểm 3); định nghĩa chỉ dùng tại đây để biết âm nào
 * chỉ là họ, biến thể hay âm cổ.
 *
 *   npx tsx scripts/build-zh-lexicon.ts <cedict_ts.u8> [data/zh/lexicon.tsv]
 */
import { readFileSync, writeFileSync } from "node:fs";

const RARE_ANYWHERE = /\((archaic|old|classical|literary)\)/i;
const RARE =
  /^(variant of|old variant of|unofficial variant of|euphemistic variant|surname |see |used in |also pr\.|Taiwan pr|\(arch|archaic|\(old\)|\(literary\)|\(dialect\)|\(Tw\))/i;
const LINE = /^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/\s*$/;

export function toLexiconRows(cedict: string): string[] {
  const rows = new Map<string, boolean>();
  for (const line of cedict.split("\n")) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, traditional, simplified, pinyin, definitions] = match;
    // Chữ hoa đầu là tên riêng; bỏ, người học không tra từ này theo âm đó.
    if (pinyin![0] !== pinyin![0]!.toLowerCase()) continue;
    const key = `${simplified}\t${traditional}\t${pinyin!.toLowerCase()}`;
    const common = definitions!.split("/").some((d) => !RARE.test(d) && !RARE_ANYWHERE.test(d));
    rows.set(key, (rows.get(key) ?? false) || common);
  }
  return [...rows].map(([key, common]) => `${key}\t${common ? 1 : 0}`);
}

if (process.argv[1]?.endsWith("build-zh-lexicon.ts")) {
  const [source, target = "data/zh/lexicon.tsv"] = process.argv.slice(2);
  if (!source) throw new Error("Thiếu đường dẫn file CC-CEDICT");
  const text = readFileSync(source, "utf8");
  const stamp = /^#! time=(\d+)/m.exec(text)?.[1];
  const date = stamp ? new Date(Number(stamp) * 1000).toISOString().slice(0, 10) : "?";
  const rows = toLexiconRows(text);
  const header = [
    `# Trích từ CC-CEDICT (MDBG), bản ${date}, giấy phép CC BY-SA 4.0. Xem data/zh/README.md.`,
    "# giản thể<TAB>phồn thể<TAB>pinyin số<TAB>1 = âm thông dụng",
  ];
  writeFileSync(target, [...header, ...rows].join("\n") + "\n");
  console.log(`Đã ghi ${rows.length} dòng vào ${target}`);
}
