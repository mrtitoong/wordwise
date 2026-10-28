/**
 * Kiểm tra link bài viết người dùng dán (tab Link): chỉ http/https tới máy chủ công khai. Chặn địa
 * chỉ nội bộ (localhost, IP riêng, IP liên kết cục bộ như máy chủ metadata 169.254.169.254) để Edge
 * Function không bị dùng để dò mạng bên trong. Hàm thuần, dùng ở cả app (báo lỗi sớm) và máy chủ
 * (kiểm tra lại từng lần chuyển hướng). Tên miền trỏ vào IP nội bộ (127.0.0.1.nip.io…) chỉ phát hiện
 * được sau khi tra DNS: máy chủ kiểm tra từng IP bằng isPrivateIp() trong fetch-page.ts.
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

/** Tách IPv6 thành 8 nhóm 16 bit (nhận cả "::" và đuôi IPv4 "::ffff:1.2.3.4"); sai dạng → null. */
function parseIpv6(raw: string): number[] | null {
  let text = raw
    .replace(/^\[|\]$/g, "")
    .split("%")[0]!
    .toLowerCase();
  let tail: number[] = [];
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255)) return null;
    tail = [(a << 8) | b, (c << 8) | d];
    text = text.slice(0, -v4[0].length);
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) =>
    part ? part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)) : [];
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const known = head.length + rest.length + tail.length;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  const out = [...head, ...new Array<number>(8 - known).fill(0), ...rest, ...tail];
  return out.some(Number.isNaN) ? null : out;
}

/**
 * IP (v4 hoặc v6, do DNS trả về) không phải địa chỉ công khai thì chặn. IPv6 chỉ nhận dải công khai
 * 2000::/3, trừ dải tài liệu, Teredo và 6to4 bọc IPv4 nội bộ; IPv4 bọc trong IPv6 (::ffff:…) cũng chặn.
 * Không đọc được → coi là nội bộ.
 */
export function isPrivateIp(ip: string): boolean {
  if (/^\d+(\.\d+){3}$/.test(ip)) {
    return ip.split(".").some((n) => Number(n) > 255) || privateIpv4(ip);
  }
  const g = parseIpv6(ip);
  if (!g) return true;
  const [g0, g1, g2] = g as [number, number, number];
  if ((g0 & 0xe000) !== 0x2000) return true;
  if (g0 === 0x2001 && (g1 === 0x0db8 || g1 === 0)) return true;
  if (g0 === 0x2002) return privateIpv4(`${g1 >> 8}.${g1 & 255}.${g2 >> 8}.${g2 & 255}`);
  return false;
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
    return isPrivateIp(host) ? { ok: false, reason: "blocked" } : { ok: true, url: url.href };
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
