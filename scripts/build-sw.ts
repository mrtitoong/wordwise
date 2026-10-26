/**
 * Đóng gói Service Worker: src/sw/sw.ts → public/sw.js (một file, không import).
 *
 *   npm run sw:build            – ghi file
 *   npm run sw:build -- --check – báo lỗi nếu file đã commit cũ hơn mã nguồn (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUTFILE = "public/sw.js";
const check = process.argv.includes("--check");

const result = await build({
  entryPoints: ["src/sw/sw.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  write: false,
  charset: "utf8",
  legalComments: "none",
  banner: {
    js:
      "// File sinh tự động từ src/sw/sw.ts bởi scripts/build-sw.ts.\n" +
      "// Không sửa tay: sửa mã nguồn rồi chạy `npm run sw:build`.",
  },
  logLevel: "warning",
});
const output = result.outputFiles[0]!.text;

if (check) {
  let current = "";
  try {
    current = readFileSync(OUTFILE, "utf8");
  } catch {
    // chưa có file
  }
  if (current !== output) {
    console.error(`${OUTFILE} cũ hơn mã nguồn: chạy npm run sw:build rồi commit.`);
    process.exit(1);
  }
} else {
  writeFileSync(OUTFILE, output);
  console.log(`${OUTFILE}: ${(output.length / 1024).toFixed(1)} KB`);
}
