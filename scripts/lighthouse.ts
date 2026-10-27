/**
 * Đo Lighthouse (điện thoại, mạng 4G chậm giả lập) cho các trang chính trên bản build đang chạy.
 * Mỗi trang chạy nhiều lượt, lấy trung vị từng mục (Hiệu năng dao động giữa các lượt).
 *
 *   npm run build && npm run start -- --port 3100   (một cửa sổ khác)
 *   npm run lighthouse                              – in bảng điểm, ghi lighthouse-report/
 *   npm run lighthouse -- --min 90                  – báo lỗi nếu mục nào dưới 90 (CI)
 *   LIGHTHOUSE_URL=https://… npm run lighthouse     – đo nơi khác (mặc định http://localhost:3100)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const BASE = (process.env.LIGHTHOUSE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const minArg = process.argv.indexOf("--min");
const MIN = minArg > 0 ? Number(process.argv[minArg + 1]) : null;

/** Khách đã xong onboarding (cookie như src/lib/auth/cookies.ts). */
const GUEST = "ww_guest=1; ww_onboarded=1";
const PAGES = [
  { name: "Chào mừng", path: "/welcome", cookie: null },
  { name: "Hôm nay", path: "/", cookie: GUEST },
  { name: "Phiên ôn", path: "/review/session", cookie: GUEST },
  { name: "Thống kê", path: "/stats", cookie: GUEST },
] as const;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const LABEL: Record<(typeof CATEGORIES)[number], string> = {
  performance: "Hiệu năng",
  accessibility: "Truy cập",
  "best-practices": "Best Practices",
  seo: "SEO",
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

async function main() {
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });
  mkdirSync("lighthouse-report", { recursive: true });
  const rows: { page: string; scores: Record<string, number>; metrics: Record<string, string> }[] =
    [];
  try {
    for (const page of PAGES) {
      const runs: Record<string, number>[] = [];
      let metrics: Record<string, string> = {};
      for (let i = 0; i < RUNS; i++) {
        const result = await lighthouse(`${BASE}${page.path}`, {
          port: chrome.port,
          output: "html",
          logLevel: "error",
          onlyCategories: [...CATEGORIES],
          extraHeaders: page.cookie ? { Cookie: page.cookie } : undefined,
        });
        if (!result) throw new Error(`Lighthouse không chạy được ${page.path}`);
        const { lhr } = result;
        runs.push(
          Object.fromEntries(
            CATEGORIES.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)]),
          ),
        );
        if (i === 0) {
          const slug = page.path === "/" ? "today" : page.path.replace(/\W+/g, "-").slice(1);
          writeFileSync(`lighthouse-report/${slug}.html`, result.report as string);
          metrics = Object.fromEntries(
            [
              "first-contentful-paint",
              "largest-contentful-paint",
              "total-blocking-time",
              "cumulative-layout-shift",
            ].map((id) => [id, lhr.audits[id]?.displayValue ?? "—"]),
          );
        }
      }
      const scores = Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => r[c]!))]));
      rows.push({ page: page.name, scores, metrics });
      // CI: bảng điểm thành ghi chú của GitHub Actions (xem được ở trang Actions).
      if (process.env.CI) {
        console.log(
          `::notice title=Lighthouse ${page.name}::${CATEGORIES.map((c) => `${LABEL[c]} ${scores[c]}`).join(" · ")}`,
        );
      }
      console.log(
        `${page.name.padEnd(10)} ${CATEGORIES.map((c) => `${LABEL[c]} ${scores[c]}`).join(" · ")}` +
          `  (FCP ${metrics["first-contentful-paint"]}, LCP ${metrics["largest-contentful-paint"]}, ` +
          `TBT ${metrics["total-blocking-time"]}, CLS ${metrics["cumulative-layout-shift"]})`,
      );
    }
  } finally {
    chrome.kill();
  }
  writeFileSync("lighthouse-report/summary.json", JSON.stringify(rows, null, 2));

  if (MIN !== null) {
    const low = rows.flatMap((r) =>
      CATEGORIES.filter((c) => r.scores[c]! < MIN).map(
        (c) => `${r.page}: ${LABEL[c]} ${r.scores[c]}`,
      ),
    );
    if (low.length) {
      console.error(`Dưới ${MIN} điểm:\n  ${low.join("\n  ")}`);
      process.exit(1);
    }
  }
}

void main();
