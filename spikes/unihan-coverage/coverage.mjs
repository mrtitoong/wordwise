// Thí nghiệm 3: độ phủ âm Hán Việt (Unihan kVietnamese) trên chữ của HSK 1–3.
//   node spikes/unihan-coverage/coverage.mjs <thư mục Unihan> <thư mục HSK>
// Thư mục HSK chứa old-{1,2,3}.json, new-{1,2,3}.json (drkameleon/complete-hsk-vocabulary)
// và hsk30-charlist.txt (elkmovie/hsk30). Kết quả ghi vào spikes/unihan-coverage/out/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [unihanDir, hskDir] = process.argv.slice(2);
if (!unihanDir || !hskDir) throw new Error("Cần <thư mục Unihan> <thư mục HSK>");
const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });

/** Đọc một file Unihan thành Map<chữ, Map<trường, giá trị>>. */
function readUnihan(file, fields) {
  const map = new Map();
  for (const line of readFileSync(join(unihanDir, file), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [cp, field, value] = line.split("\t");
    if (!fields.includes(field)) continue;
    const ch = String.fromCodePoint(parseInt(cp.slice(2), 16));
    if (!map.has(ch)) map.set(ch, new Map());
    map.get(ch).set(field, value.trim());
  }
  return map;
}
const readings = readUnihan("Unihan_Readings.txt", ["kVietnamese", "kMandarin"]);
const variants = readUnihan("Unihan_Variants.txt", ["kTraditionalVariant"]);
const cps = (v) =>
  (v ?? "")
    .split(" ")
    .filter(Boolean)
    .map((u) => String.fromCodePoint(parseInt(u.slice(2).split("<")[0], 16)));
const viet = (ch) => readings.get(ch)?.get("kVietnamese");

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
function charsOfWords(file) {
  const set = new Set();
  for (const w of JSON.parse(readFileSync(join(hskDir, file), "utf8")))
    for (const ch of w.s) if (isHan(ch)) set.add(ch);
  return set;
}
function charList(fromLine, toLine) {
  const lines = readFileSync(join(hskDir, "hsk30-charlist.txt"), "utf8").split("\n");
  const set = new Set();
  for (const line of lines.slice(fromLine, toLine)) {
    const ch = line.split("\t")[1]?.trim();
    if (ch && isHan(ch)) set.add(ch);
  }
  return set;
}
const union = (...sets) => new Set(sets.flatMap((s) => [...s]));

const sets = {
  "HSK 2.0 cấp 1–3 (600 từ) – chữ trong từ": union(
    ...["old-1", "old-2", "old-3"].map((f) => charsOfWords(`${f}.json`)),
  ),
  "HSK 3.0 cấp 1–3 (2.245 từ) – chữ trong từ": union(
    ...["new-1", "new-2", "new-3"].map((f) => charsOfWords(`${f}.json`)),
  ),
  "HSK 3.0 bảng chữ cấp 1–3 (900 chữ)": charList(6, 912),
};

const report = [];
for (const [name, set] of Object.entries(sets)) {
  const direct = [],
    viaTrad = [],
    missing = [];
  for (const ch of set) {
    if (viet(ch)) {
      direct.push(ch);
      continue;
    }
    const trad = cps(variants.get(ch)?.get("kTraditionalVariant")).filter(
      (t) => t !== ch && viet(t),
    );
    if (trad.length) viaTrad.push(`${ch}→${trad[0]} (${viet(trad[0])})`);
    else missing.push(ch);
  }
  const multi = direct.filter((ch) => viet(ch).split(" ").length > 1).length;
  report.push({ name, total: set.size, direct: direct.length, viaTrad, missing, multi });
}

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
let md =
  "| Tập chữ | Số chữ | Có kVietnamese trực tiếp | + qua chữ phồn thể | Thiếu | Chữ có ≥ 2 âm |\n|---|---|---|---|---|---|\n";
for (const r of report)
  md += `| ${r.name} | ${r.total} | ${r.direct} (${pct(r.direct, r.total)}) | ${r.direct + r.viaTrad.length} (${pct(r.direct + r.viaTrad.length, r.total)}) | ${r.missing.length} | ${r.multi} |\n`;
for (const r of report) {
  md += `\n### ${r.name}\n\nThiếu hẳn (${r.missing.length}): ${r.missing.join(" ") || "—"}\n\n`;
  md += `Chỉ có qua chữ phồn thể (${r.viaTrad.length}): ${r.viaTrad.join(", ") || "—"}\n`;
}
const sample =
  "爱 们 这 说 学 习 中 国 人 好 吗 的 了 是 不 我 你 他 她 吃 喝 买 卖 东 西 谢 再 见 么 呢 吧 啊 喂 哪 那 个 点 块 元 钱 很 太 都 也 还 就 才 又".split(
    " ",
  );
md +=
  "\n### Mẫu âm đọc (kVietnamese, theo thứ tự Unihan)\n\n| Chữ | kMandarin | kVietnamese |\n|---|---|---|\n";
for (const ch of sample) {
  const t = viet(ch) ? "" : cps(variants.get(ch)?.get("kTraditionalVariant")).find((x) => viet(x));
  md += `| ${ch}${t ? ` (${t})` : ""} | ${readings.get(ch)?.get("kMandarin") ?? ""} | ${viet(ch) ?? (t ? viet(t) + " *(phồn thể)*" : "—")} |\n`;
}
writeFileSync(join(outDir, "coverage.md"), md);
console.log(md);
