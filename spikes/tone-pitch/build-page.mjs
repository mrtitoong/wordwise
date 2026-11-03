// Ghép pitch.ts (esbuild, biến toàn cục TonePitch) và mẫu thanh học được vào trang thử.
//   node spikes/tone-pitch/build-page.mjs   (cần chạy evaluate.ts trước để có out/templates.json)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const lib = buildSync({
  entryPoints: [join(here, "pitch.ts")],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "TonePitch",
  target: "es2020",
  write: false,
}).outputFiles[0].text;
const html = readFileSync(join(here, "tone-lab.template.html"), "utf8")
  .replace("/*__LIB__*/", () => lib.replace(/<\/script/g, "<\/script"))
  .replace("/*__TEMPLATES__*/{}", () => readFileSync(join(here, "out", "templates.json"), "utf8"));
writeFileSync(join(here, "out", "tone-lab.html"), html);
console.log(
  `out/tone-lab.html: ${(html.length / 1024).toFixed(1)} KB (thư viện ${(lib.length / 1024).toFixed(1)} KB)`,
);
