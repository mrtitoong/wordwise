// Thí nghiệm 2: kích thước dữ liệu nét (hanzi-writer-data) cho 900 chữ HSK 3.0 cấp 1–3.
//   node spikes/hanzi-writer/data-size.mjs <thư mục hanzi-writer-data> <hsk30-charlist.txt>
import { readFileSync, existsSync } from "node:fs";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { join } from "node:path";

const [dataDir, charlist] = process.argv.slice(2);
const lines = readFileSync(charlist, "utf8").split("\n");
const levels = { 1: lines.slice(6, 307), 2: lines.slice(308, 609), 3: lines.slice(610, 911) };
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let all = [],
  missing = [];
for (const [level, rows] of Object.entries(levels)) {
  const sizes = [];
  for (const row of rows) {
    const ch = row.split("\t")[1]?.trim();
    if (!ch) continue;
    const file = join(dataDir, `${ch}.json`);
    if (!existsSync(file)) {
      missing.push(ch);
      continue;
    }
    const raw = readFileSync(file);
    const json = JSON.parse(raw);
    sizes.push({ ch, raw: raw.length, gz: gzipSync(raw).length, strokes: json.strokes.length });
  }
  all.push(...sizes);
  const sum = (k) => sizes.reduce((s, x) => s + x[k], 0);
  console.log(
    `Cấp ${level}: ${sizes.length} chữ, thô ${kb(sum("raw"))}, gzip từng file ${kb(sum("gz"))}`,
  );
}
const sorted = [...all].sort((a, b) => a.raw - b.raw);
const med = sorted[Math.floor(sorted.length / 2)];
const max = sorted.at(-1);
const bundle = Buffer.from(
  JSON.stringify(
    Object.fromEntries(
      all.map(({ ch }) => [ch, JSON.parse(readFileSync(join(dataDir, `${ch}.json`)))]),
    ),
  ),
);
console.log(
  `Tổng ${all.length} chữ: thô ${kb(all.reduce((s, x) => s + x.raw, 0))}; gộp 1 file: gzip ${kb(gzipSync(bundle).length)}, brotli ${kb(brotliCompressSync(bundle).length)}`,
);
console.log(
  `Trung vị ${med.ch} ${kb(med.raw)} thô / ${kb(med.gz)} gzip (${med.strokes} nét); lớn nhất ${max.ch} ${kb(max.raw)} / ${kb(max.gz)} (${max.strokes} nét)`,
);
console.log(`Thiếu dữ liệu nét: ${missing.join(" ") || "không"}`);
