// Thí nghiệm 2 (phần tự động): Hanzi Writer chế độ quiz trên Chromium giả lập điện thoại cảm ứng.
// Vẽ nét bằng sự kiện chạm thật (CDP Input.dispatchTouchEvent) theo đường giữa nét (medians) của
// dữ liệu, thêm nhiễu để giống ngón tay, và vẽ nét sai (ngược chiều, sai thứ tự). Đo:
//   - tỉ lệ nét đúng được chấp nhận theo mức nhiễu (chấm sai oan),
//   - tỉ lệ nét sai bị chấp nhận nhầm,
//   - thời gian chấm một nét (nhấc tay → onCorrectStroke/onMistake), CPU chậm 4× như máy tầm trung.
//
//   node spikes/hanzi-writer/synthetic.mjs <thư mục hanzi-writer-data> <hanzi-writer.min.js>
// Không thay cho thử trên máy thật (Safari iOS, Chrome Android): ngón tay thật run, lệch khác nhiễu giả.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const [dataDir, libPath] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const CHARS = ["人", "大", "口", "中", "我", "你", "好", "是", "爱", "谢"];
const data = Object.fromEntries(
  CHARS.map((ch) => [ch, JSON.parse(readFileSync(join(dataDir, `${ch}.json`), "utf8"))]),
);
const SIZE = 320,
  PADDING = 12;
const NOISE = [0, 15, 30, 45, 60, 80]; // đơn vị lưới 1024 của dữ liệu (≈ 0–8% cạnh ô)
const REPEAT = 2;
const LENIENCY = [1, 1.5];

// Tất định để chạy lại ra cùng số.
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0">
<div id="board" style="width:${SIZE}px;height:${SIZE}px;touch-action:none"></div>
<script>${readFileSync(libPath, "utf8")}</script>
<script>
const DATA = ${JSON.stringify(data)};
window.events = [];
let upAt = null;
document.addEventListener("touchend", () => { upAt = performance.now(); }, true);
window.start = (ch, leniency) => new Promise((resolve) => {
  document.getElementById("board").innerHTML = "";
  window.events = [];
  const w = HanziWriter.create("board", ch, { width: ${SIZE}, height: ${SIZE}, padding: ${PADDING},
    showCharacter: false, showOutline: false, showHintAfterMisses: false, leniency,
    charDataLoader: (c, onLoad) => onLoad(DATA[c]) });
  const push = (ok) => (d) => window.events.push({ ok, stroke: d.strokeNum, ms: upAt == null ? null : performance.now() - upAt });
  w.quiz({ onCorrectStroke: push(true), onMistake: push(false), onComplete: () => {} });
  setTimeout(resolve, 50);
});
</script>`;

// Điểm trong lưới dữ liệu → điểm trên màn hình (nghịch đảo Positioner.convertExternalPoint).
const eff = SIZE - 2 * PADDING,
  scale = Math.min(eff / 1024, eff / 1024);
const xOff = PADDING + (eff - scale * 1024) / 2,
  yOff = 124 * scale + PADDING + (eff - scale * 1024) / 2;
const toScreen = ([x, y]) => ({ x: x * scale + xOff, y: SIZE - yOff - y * scale });

/** Nội suy đường giữa nét thành ~20 điểm, cộng nhiễu: lệch cả nét + rung chậm theo từng điểm. */
function strokePath(median, noise) {
  const pts = [];
  for (let i = 0; i < median.length - 1; i++)
    for (let t = 0; t < 1; t += 0.5)
      pts.push([
        median[i][0] + (median[i + 1][0] - median[i][0]) * t,
        median[i][1] + (median[i + 1][1] - median[i][1]) * t,
      ]);
  pts.push(median.at(-1));
  const shift = [gauss() * noise * 0.6, gauss() * noise * 0.6];
  let drift = [0, 0];
  return pts.map(([x, y]) => {
    drift = [drift[0] * 0.7 + gauss() * noise * 0.4, drift[1] * 0.7 + gauss() * noise * 0.4];
    return toScreen([x + shift[0] + drift[0], y + shift[1] + drift[1]]);
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();
await page.setContent(html);
const cdp = await context.newCDPSession(page);
const throttle = (rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate });

async function draw(points) {
  const tp = (p) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(points[0]) });
  for (const p of points.slice(1))
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(p) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const lastEvent = () => page.evaluate(() => window.events.at(-1) ?? null);

const results = [];
for (const leniency of LENIENCY) {
  console.error(`leniency ${leniency}`);
  // 1) Nét đúng có nhiễu: mỗi nét thử một lần; bị từ chối thì vẽ lại bản không nhiễu để đi tiếp.
  for (const noise of NOISE) {
    console.error(`  nhiễu ${noise}`);
    let ok = 0,
      total = 0;
    const ms = [];
    for (let r = 0; r < REPEAT; r++)
      for (const ch of CHARS) {
        await page.evaluate(([c, l]) => window.start(c, l), [ch, leniency]);
        for (const median of data[ch].medians) {
          await draw(strokePath(median, noise));
          const e = await lastEvent();
          total++;
          if (e?.ms != null) ms.push(e.ms);
          if (e?.ok) ok++;
          else await draw(strokePath(median, 0));
        }
      }
    ms.sort((a, b) => a - b);
    results.push({
      test: "đúng",
      leniency,
      noise,
      accepted: ok,
      total,
      gradeMedian: ms[Math.floor(ms.length / 2)],
      gradeP95: ms[Math.floor(ms.length * 0.95)],
    });
  }
  // 2) Nét sai: ngược chiều, và nét sau thay cho nét đang cần (sai thứ tự). Nhiễu 30.
  for (const kind of ["ngược chiều", "sai thứ tự"]) {
    let accepted = 0,
      total = 0;
    for (let r = 0; r < REPEAT; r++)
      for (const ch of CHARS) {
        await page.evaluate(([c, l]) => window.start(c, l), [ch, leniency]);
        const medians = data[ch].medians;
        for (let i = 0; i < medians.length; i++) {
          const wrong = kind === "ngược chiều" ? [...medians[i]].reverse() : medians[i + 1];
          if (wrong) {
            const before = await page.evaluate(() => window.events.length);
            await draw(strokePath(wrong, 30));
            const e = await lastEvent();
            const after = await page.evaluate(() => window.events.length);
            total++;
            if (after > before && e?.ok) {
              accepted++;
              continue;
            } // bị chấp nhận nhầm: quiz đã sang nét sau
          }
          await draw(strokePath(medians[i], 0));
        }
      }
    results.push({ test: kind, leniency, noise: 30, accepted, total });
  }
}
// 3) Thời gian chấm khi CPU chậm 4× (máy tầm trung): nét đúng không nhiễu, leniency 1.
await throttle(4);
{
  const ms = [];
  for (const ch of CHARS) {
    await page.evaluate(([c, l]) => window.start(c, l), [ch, 1]);
    for (const median of data[ch].medians) {
      await draw(strokePath(median, 0));
      const e = await lastEvent();
      if (e?.ms != null) ms.push(e.ms);
    }
  }
  ms.sort((a, b) => a - b);
  results.push({
    test: "CPU chậm 4×",
    leniency: 1,
    noise: 0,
    accepted: ms.length,
    total: ms.length,
    gradeMedian: ms[Math.floor(ms.length / 2)],
    gradeP95: ms[Math.floor(ms.length * 0.95)],
  });
}
await browser.close();

const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
let md =
  "| Leniency | Thử | Nhiễu (/1024) | Chấp nhận | Tỉ lệ | Chấm 1 nét: trung vị / p95 |\n|---|---|---|---|---|---|\n";
for (const r of results)
  md += `| ${r.leniency} | ${r.test} | ${r.noise} | ${r.accepted}/${r.total} | ${pct(r.accepted, r.total)} | ${r.gradeMedian != null ? `${r.gradeMedian.toFixed(1)} / ${r.gradeP95.toFixed(1)} ms` : ""} |\n`;
mkdirSync(join(here, "out"), { recursive: true });
writeFileSync(join(here, "out", "synthetic.md"), md);
console.log(md);
