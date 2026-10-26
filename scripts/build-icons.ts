/**
 * Sinh icon PNG cho PWA từ src/app/icon.svg (chạy tay khi đổi icon: `npm run icons:build`).
 * Dùng Chromium của Playwright để vẽ SVG (không cần thêm thư viện xử lý ảnh).
 *   public/icons/icon-192.png, icon-512.png   – icon thường (góc bo)
 *   public/icons/maskable-512.png             – icon "maskable": nền tràn viền, hình nằm trong vùng an toàn 80%
 *   src/app/apple-icon.png (180)              – iPhone/iPad "Thêm vào Màn hình chính"
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BRAND = "#1f7396";

async function main() {
  const svg = await readFile("src/app/icon.svg", "utf8");
  // Bỏ góc bo để dùng cho icon tràn viền (maskable, apple: hệ điều hành tự cắt góc).
  const square = svg.replace(/ rx="112"/, "");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (markup: string, size: number, path: string, scale = 1) => {
    await page.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * scale);
    await page.setContent(
      `<html><body style="margin:0;background:${scale < 1 ? BRAND : "transparent"};display:grid;place-items:center;height:${size}px">` +
        `<div style="width:${inner}px;height:${inner}px">${markup.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
    );
    await page.screenshot({
      path,
      omitBackground: scale === 1,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(path);
  };
  await render(svg, 192, "public/icons/icon-192.png");
  await render(svg, 512, "public/icons/icon-512.png");
  await render(square, 512, "public/icons/maskable-512.png", 0.8);
  await render(square, 180, "src/app/apple-icon.png");
  await browser.close();
}

void main();
