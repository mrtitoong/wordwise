/**
 * Tạo bộ ảnh mẫu tổng hợp cho OCR (tests/fixtures/ocr): dựng trang chữ bằng HTML trong Chromium
 * rồi chụp lại, kèm file .txt là chữ đúng để đo độ chính xác (scripts/ocr-accuracy.ts).
 *
 *   npx tsx scripts/make-ocr-fixtures.ts
 *
 * Văn bản là đoạn tự viết (không lấy từ sách có bản quyền). Ảnh chụp thật (sách, biển hiệu, chữ
 * viết tay) do chủ sản phẩm chụp, đặt cùng thư mục với tên real-*.jpg và real-*.txt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = "tests/fixtures/ocr";

const BOOK = `Resilient people do not see setbacks as proof of failure. They treat every mistake as a lesson, not a verdict, and they persevere through adversity with patience and grit.

When a project collapses, they ask what went wrong, adjust their plan, and try again. Over time, this habit turns ordinary workers into remarkable problem solvers.`;

const SCREEN = `Quarterly update
Our team shipped three features ahead of schedule. Customer satisfaction rose by twelve percent, although response times on weekends remain inconsistent.
Next steps: streamline onboarding, reduce churn, and allocate more resources to support.`;

const SIGN = `CAUTION
Wet floor
Please use the handrail`;

type Fixture = {
  name: string;
  text: string;
  html: string;
  width: number;
  height: number;
};

const paragraphs = (text: string) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");

function bookPage(text: string, extraCss = ""): string {
  return `<html><body style="margin:0;background:#3b3b3b;">
  <div id="page" style="width:1400px;margin:60px auto;padding:80px 100px;background:#f6f0e1;
    font:34px/1.55 Georgia,'Times New Roman',serif;color:#1d1a16;box-shadow:0 10px 40px #0008;${extraCss}">
    ${paragraphs(text)}
  </div></body></html>`;
}

const FIXTURES: Fixture[] = [
  { name: "print-clear", text: BOOK, html: bookPage(BOOK), width: 1600, height: 1200 },
  {
    name: "print-tilted",
    text: BOOK,
    html: bookPage(BOOK, "transform:rotate(-7deg);transform-origin:center;"),
    width: 1600,
    height: 1300,
  },
  {
    name: "print-blurry",
    text: BOOK,
    html: bookPage(BOOK, "filter:blur(4px);"),
    width: 1600,
    height: 1200,
  },
  {
    name: "print-dark",
    text: BOOK,
    html: bookPage(BOOK, "filter:brightness(0.28);"),
    width: 1600,
    height: 1200,
  },
  {
    name: "screen",
    text: SCREEN,
    html: `<html><body style="margin:0;background:#fff;font:28px/1.5 Arial,Helvetica,sans-serif;color:#111;">
      <div style="height:90px;background:#1f6feb;color:#fff;display:flex;align-items:center;padding:0 40px;font-size:30px;">Mail</div>
      <div style="padding:40px 60px;"><h1 style="font-size:44px;margin:0 0 24px;">${SCREEN.split("\n")[0]}</h1>
      ${paragraphs(SCREEN.split("\n").slice(1).join("\n"))}</div></body></html>`,
    width: 1080,
    height: 1100,
  },
  {
    name: "sign-colored",
    text: SIGN,
    html: `<html><body style="margin:0;background:linear-gradient(135deg,#6b4f2a,#2e3b2f);display:flex;align-items:center;justify-content:center;height:100%;">
      <div style="background:#f2c200;border:14px solid #111;border-radius:24px;padding:50px 80px;text-align:center;font:bold 64px/1.3 Arial,sans-serif;color:#111;">
      ${SIGN.split("\n")
        .map((l, i) => `<div style="font-size:${i === 0 ? 96 : 60}px">${l}</div>`)
        .join("")}
      </div></body></html>`,
    width: 1200,
    height: 900,
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const fixture of FIXTURES) {
    const page = await browser.newPage({
      viewport: { width: fixture.width, height: fixture.height },
    });
    await page.setContent(fixture.html);
    await page.screenshot({ path: `${OUT}/${fixture.name}.jpg`, type: "jpeg", quality: 85 });
    writeFileSync(`${OUT}/${fixture.name}.txt`, fixture.text + "\n");
    await page.close();
    console.log(`${OUT}/${fixture.name}.jpg`);
  }
} finally {
  await browser.close();
}
