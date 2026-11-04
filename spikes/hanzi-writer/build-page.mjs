// Ghép dữ liệu nét của 10 chữ HSK 1 vào trang thử (quiz.template.html → out/quiz.html).
//   node spikes/hanzi-writer/build-page.mjs <thư mục hanzi-writer-data>
// Trang sinh ra chứa dữ liệu Arphic PL nên chỉ để ở out/ (không commit).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const CHARS = ["人", "大", "口", "中", "我", "你", "好", "是", "爱", "谢"];
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2];
const data = Object.fromEntries(
  CHARS.map((ch) => [ch, JSON.parse(readFileSync(join(dataDir, `${ch}.json`), "utf8"))]),
);
mkdirSync(join(here, "out"), { recursive: true });
const html = readFileSync(join(here, "quiz.template.html"), "utf8").replace(
  "/*__DATA__*/{}",
  JSON.stringify(data),
);
writeFileSync(join(here, "out", "quiz.html"), html);
console.log(`out/quiz.html: ${(html.length / 1024).toFixed(1)} KB`);
