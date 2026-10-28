/**
 * Kiểm tra link bài viết người dùng dán (tab Link): chỉ http/https tới máy chủ công khai. Chặn địa
 * chỉ nội bộ (localhost, IP riêng, IP liên kết cục bộ như máy chủ metadata 169.254.169.254) để Edge
 * Function không bị dùng để dò mạng bên trong. Hàm thuần, dùng ở cả app (báo lỗi sớm) và máy chủ
 * (kiểm tra lại từng lần chuyển hướng).
 */

export const MAX_URL_LENGTH = 2000;

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: "invalid_url" | "blocked" };

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".arpa"];

/** IPv4 dạng a.b.c.d thuộc dải riêng/đặc biệt. */
function privateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Thêm https:// khi người dùng dán thiếu ("vnexpress.net/…"); bỏ khoảng trắng hai đầu. */
export function normalizeUrlInput(raw: string): string {
  const value = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

export function checkArticleUrl(raw: string): UrlCheck {
  const input = normalizeUrlInput(raw);
  if (!input || input.length > MAX_URL_LENGTH) return { ok: false, reason: "invalid_url" };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.username || url.password) return { ok: false, reason: "blocked" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "blocked" };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // IPv6 viết thẳng ([::1], [fd00::…]): chặn hết – bài viết thật luôn có tên miền.
  if (host.startsWith("[") || host.includes(":")) return { ok: false, reason: "blocked" };
  if (/^\d+(\.\d+){3}$/.test(host)) {
    return privateIpv4(host) ? { ok: false, reason: "blocked" } : { ok: true, url: url.href };
  }
  // Tên không có dấu chấm (máy trong mạng nội bộ) hoặc đuôi nội bộ.
  if (!host.includes(".") || host === "localhost") return { ok: false, reason: "blocked" };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "blocked" };
  }
  // IPv4 viết kiểu số nguyên/hex (0x7f.1, 2130706433) đã bị URL chuẩn hoá thành a.b.c.d ở trên.
  url.hash = "";
  return { ok: true, url: url.href };
}
