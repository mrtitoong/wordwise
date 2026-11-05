/**
 * Chép dữ liệu nét của hanzi-writer-data vào public/hanzi để app tự phục vụ, tải theo từng chữ. Giữ
 * nguyên từng file và kèm ARPHICPL.TXT (điều kiện của Arphic PL, docs/zh-spike.md §4). Thư mục đích
 * không nằm trong git; chạy tự động trước `dev` và `build`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "node_modules/hanzi-writer-data";
const TARGET = "public/hanzi";
const LICENSE = "ARPHICPL.TXT";

const files = readdirSync(SOURCE).filter(
  (name) => name.endsWith(".json") && name !== "package.json",
);
mkdirSync(TARGET, { recursive: true });
let copied = 0;
for (const name of [...files, LICENSE]) {
  const target = join(TARGET, name);
  if (existsSync(target)) continue;
  copyFileSync(join(SOURCE, name), target);
  copied++;
}
console.log(`Dữ liệu nét: ${files.length} chữ, chép mới ${copied} file.`);
