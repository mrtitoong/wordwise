/**
 * Quy tắc của Service Worker (src/sw/sw.ts): yêu cầu nào lưu vào đâu, trang nào lưu sẵn. Hàm thuần,
 * dùng chung cho Service Worker và app (xóa trang đã lưu khi đăng xuất, tải trước audio).
 *
 * - static: JS/CSS của Next (`/_next/static`, tên file có mã băm nên không đổi) và icon → lưu lần
 *   đầu, sau đó lấy từ máy.
 * - page: mở trang (navigate) → lấy mạng trước, lưu bản mới; mất mạng thì trả bản đã lưu, chưa có
 *   thì trang /offline.
 * - media: audio (bucket công khai `audio`) và ảnh minh họa → lấy từ máy nếu đã có, giới hạn số file.
 */

const VERSION = 1;
export const CACHE_NAMES = {
  static: `ww-static-v${VERSION}`,
  pages: `ww-pages-v${VERSION}`,
  media: `ww-media-v${VERSION}`,
} as const;

export const OFFLINE_PAGE = "/offline";

/** Trang chính lưu sẵn để mở được khi offline (thẻ từ, trang từng sổ lưu khi đã mở). */
export const SHELL_PAGES = [
  "/",
  "/review/session",
  "/notebooks",
  "/practice",
  "/stats",
  "/settings",
  "/add",
  OFFLINE_PAGE,
] as const;

/** Tối đa số file audio/ảnh lưu trên máy (~10 KB/audio, ~100 KB/ảnh: cỡ 50 MB). */
export const MEDIA_MAX_ENTRIES = 1500;
export const STATIC_MAX_ENTRIES = 400;
export const PAGES_MAX_ENTRIES = 80;
/** Mạng chậm quá chừng này thì trả trang đã lưu (nếu có) thay vì chờ. */
export const NAVIGATION_TIMEOUT_MS = 5_000;

/** Trang không lưu: cần mạng mới có ý nghĩa (đăng nhập, quản trị). */
const ONLINE_ONLY = ["/auth", "/login", "/admin", "/api"];

/** Nơi lấy ảnh minh họa (Pexels, Unsplash) – xem docs: Prompt 2.2. */
const IMAGE_HOSTS = ["images.pexels.com", "images.unsplash.com", "plus.unsplash.com"];

export type RouteKind = "static" | "page" | "media" | "bypass";

export type RequestInfo = {
  url: string;
  method: string;
  mode: string;
  destination: string;
};

function startsWithPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function classifyRequest(request: RequestInfo, origin: string): RouteKind {
  if (request.method !== "GET") return "bypass";
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return "bypass";
  }
  if (url.origin === origin) {
    if (url.pathname.startsWith("/_next/static/")) return "static";
    if (url.pathname.startsWith("/icons/") || /^\/(icon|apple-icon)[^/]*$/.test(url.pathname)) {
      return "static";
    }
    if (request.mode === "navigate") {
      return ONLINE_ONLY.some((base) => startsWithPath(url.pathname, base)) ? "bypass" : "page";
    }
    return "bypass";
  }
  if (url.pathname.includes("/storage/v1/object/public/audio/")) return "media";
  if (request.destination === "image" && IMAGE_HOSTS.includes(url.hostname)) return "media";
  return "bypass";
}

/** Trang trước khi bắt đầu dùng app: trang chính còn chuyển hướng về đây nên chưa lưu được. */
const BEFORE_START = ["/welcome", "/onboarding", "/login", "/auth", "/offline", "/admin"];
/** Lưu lại trang chính tối đa mỗi giờ một lần; lần trước chưa lưu được trang Hôm nay thì thử lại sớm. */
export const WARM_EVERY_MS = 60 * 60 * 1000;
export const WARM_RETRY_MS = 30_000;

/** `build`: mã bản app lúc lưu – có bản mới thì lưu lại ngay (tên file JS đổi theo bản). */
export type WarmRecord = { at: number; ok: boolean; build?: string };

/**
 * Đang ôn: lưu lại trang chính (tải và đọc lại mọi file JS) làm máy chậm đúng lúc chuyển câu, nên
 * chỉ lưu khi chưa lưu được lần nào (vừa xong onboarding là vào thẳng phiên ôn); lưu lại (bản mới,
 * quá giờ) đợi tới khi rời phiên.
 */
const BUSY = ["/review"];

/**
 * Có nên nhờ Service Worker lưu sẵn trang chính khi đang ở `pathname`? (App không đọc được cookie
 * trạng thái – httpOnly – nên dựa vào trang đang mở: đã vào trang trong app là đã bắt đầu dùng.)
 */
export function shouldWarmPages(
  pathname: string,
  last: WarmRecord | null,
  now: number,
  build?: string,
): boolean {
  if (BEFORE_START.some((base) => startsWithPath(pathname, base))) return false;
  if (!last) return true;
  // Đang ôn: chỉ thử lại khi lần đầu chưa lưu được (vd trang Hôm nay còn chuyển hướng).
  if (BUSY.some((base) => startsWithPath(pathname, base)) && last.ok) return false;
  if (build !== undefined && last.build !== build) return true;
  return now - last.at > (last.ok ? WARM_EVERY_MS : WARM_RETRY_MS);
}

/** Đường dẫn JS/CSS của Next trong một trang HTML, để lưu kèm trang (mở offline vẫn chạy được). */
export function assetUrlsInHtml(html: string): string[] {
  const found = html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [];
  return [...new Set(found)];
}

/**
 * File JS/CSS mà một file JS có thể tải sau (import động: Next/Turbopack ghi tên file trong code).
 * Lưu sẵn theo chuỗi này thì phần code tải khi cần cũng chạy được offline – đúng file của từng nơi
 * gọi (cùng một module có thể nằm ở file khác nhau tùy trang gọi nó).
 */
export function chunkUrlsInScript(source: string): string[] {
  const found = source.match(/static\/chunks\/[\w.-]+\.(?:js|css)/g) ?? [];
  return [...new Set(found.map((path) => `/_next/${path}`))];
}

/** Khóa cũ nhất cần xóa để còn tối đa `max` mục (Cache Storage giữ thứ tự thêm vào). */
export function keysToTrim<T>(keys: readonly T[], max: number): T[] {
  return keys.length > max ? keys.slice(0, keys.length - max) : [];
}

/**
 * Đọc header Range kiểu "bytes=start-end" (thẻ <audio> hay xin từng đoạn). Trả đoạn byte (end tính
 * cả) hoặc null khi không đọc được/không khớp kích thước file.
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // "bytes=-500": 500 byte cuối.
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}
