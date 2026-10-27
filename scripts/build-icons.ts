/**
 * Sinh icon từ logo public/brand/logo.svg (chạy tay khi đổi logo: `npm run icons:build`).
 * Dùng Chromium của Playwright để vẽ SVG (không cần thêm thư viện xử lý ảnh).
 *   src/app/icon.svg                          – favicon SVG (bản sao của logo, nét ở mọi cỡ)
 *   src/app/favicon.ico                       – favicon 32px (ảnh PNG trong file ICO) cho trình duyệt không nhận SVG
 *   public/icons/icon-192.png, icon-512.png   – icon thường (góc bo như logo)
 *   public/icons/maskable-192.png, -512.png   – icon "maskable": nền tràn viền, hình thu vào 75% để
 *                                               chấm xanh ở góc vẫn nằm trong vùng an toàn (hình tròn 80%)
 *   src/app/apple-icon.png (180)              – iPhone/iPad "Thêm vào Màn hình chính" (vuông, iOS tự bo góc)
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

/** Màu nền của logo (nền tràn viền cho bản maskable). */
const BRAND = "#6C4CF5";
/** Hình trong bản maskable chiếm chừng này cạnh icon. */
const MASKABLE_SCALE = 0.75;

/** favicon.ico chứa đúng một ảnh PNG (định dạng ICO cho phép PNG từ Windows Vista). */
function icoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // dự trữ
  header.writeUInt16LE(1, 2); // loại: icon
  header.writeUInt16LE(1, 4); // số ảnh
  header.writeUInt8(size, 6); // rộng
  header.writeUInt8(size, 7); // cao
  header.writeUInt8(0, 8); // số màu (0 = không dùng bảng màu)
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // số mặt phẳng màu
  header.writeUInt16LE(32, 12); // bit mỗi điểm ảnh
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18); // vị trí dữ liệu ảnh
  return Buffer.concat([header, png]);
}

async function main() {
  const logo = await readFile("public/brand/logo.svg", "utf8");
  await writeFile("src/app/icon.svg", logo);
  // Bỏ góc bo của nền để dùng cho icon tràn viền (maskable, apple: hệ điều hành tự cắt góc).
  const square = logo.replace(
    /<rect width="120" height="120" rx="28"/,
    '<rect width="120" height="120"',
  );
  if (square === logo) throw new Error("Không tìm thấy nền bo góc trong logo.svg");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (markup: string, size: number, path: string | null, scale = 1) => {
    await page.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * scale);
    const svg = markup.replace(/ width="\d+" height="\d+"/, ` width="${inner}" height="${inner}"`);
    await page.setContent(
      `<html><body style="margin:0;background:${scale < 1 ? BRAND : "transparent"};display:grid;place-items:center;height:${size}px">` +
        `<div style="width:${inner}px;height:${inner}px;line-height:0">${svg}</div></body></html>`,
    );
    const png = await page.screenshot({
      path: path ?? undefined,
      omitBackground: scale === 1,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    if (path) console.log(path);
    return png;
  };
  await render(logo, 192, "public/icons/icon-192.png");
  await render(logo, 512, "public/icons/icon-512.png");
  await render(square, 192, "public/icons/maskable-192.png", MASKABLE_SCALE);
  await render(square, 512, "public/icons/maskable-512.png", MASKABLE_SCALE);
  await render(square, 180, "src/app/apple-icon.png");
  const favicon = await render(logo, 32, null);
  await writeFile("src/app/favicon.ico", icoFromPng(favicon, 32));
  console.log("src/app/favicon.ico");
  await browser.close();
}

void main();
