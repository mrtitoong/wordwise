/**
 * Phía app của chế độ offline: đăng ký Service Worker (public/sw.js), nhờ nó lưu sẵn trang chính,
 * xóa trang đã lưu khi đăng xuất. Chỉ bản build thật (next dev không dùng Service Worker).
 */
import {
  CACHE_NAMES,
  SHELL_PAGES,
  shouldWarmPages,
  type WarmRecord,
} from "@/lib/offline/sw-policy";

const WARM_KEY = "ww_sw_warm";
/** Mã bản app (next.config.ts): bản mới thì lưu lại trang chính và code ngay, không đợi một giờ. */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

export function offlineSupported(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  );
}

function lastWarm(): WarmRecord | null {
  try {
    return JSON.parse(localStorage.getItem(WARM_KEY) ?? "null") as WarmRecord | null;
  } catch {
    return null;
  }
}

function markWarmed(record: WarmRecord) {
  try {
    localStorage.setItem(WARM_KEY, JSON.stringify(record));
  } catch {
    // Không lưu được (chế độ riêng tư): lần mở sau lưu lại, không sao.
  }
}

let registering: Promise<ServiceWorkerRegistration> | null = null;
let warming = false;

/** Nhờ Service Worker lưu các trang; trả về trang đã lưu được. */
function warm(worker: ServiceWorker, pages: readonly string[]): Promise<string[]> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<{ saved?: string[] }>) =>
      resolve(event.data.saved ?? []);
    worker.postMessage({ type: "warm", pages: [...pages] }, [channel.port2]);
    // Không chờ mãi nếu Service Worker bị thay giữa chừng.
    setTimeout(() => resolve([]), 60_000);
  });
}

/**
 * Đăng ký Service Worker và lưu sẵn trang chính (gọi mỗi lần đổi trang; quy tắc ở
 * shouldWarmPages). Trả về khi đã lưu xong (hoặc bỏ qua).
 */
export async function setUpOffline(pathname: string): Promise<void> {
  if (!offlineSupported()) return;
  registering ??= navigator.serviceWorker.register("/sw.js");
  const registration = await registering;
  await navigator.serviceWorker.ready;
  const now = Date.now();
  if (warming || !navigator.onLine || !shouldWarmPages(pathname, lastWarm(), now, BUILD_ID)) {
    return;
  }
  const worker = registration.active;
  if (!worker) return;
  warming = true;
  try {
    const saved = await warm(worker, SHELL_PAGES);
    // Chưa lưu được Hôm nay (vd vẫn bị chuyển về onboarding): thử lại sớm.
    markWarmed({ at: now, ok: saved.includes("/"), build: BUILD_ID });
  } finally {
    warming = false;
  }
}

/** Đăng xuất: xóa trang đã lưu (máy dùng chung). Audio/ảnh là nội dung công khai nên giữ. */
export async function clearOfflinePages(): Promise<void> {
  try {
    localStorage.removeItem(WARM_KEY);
  } catch {
    // bỏ qua
  }
  if (typeof caches === "undefined") return;
  await caches.delete(CACHE_NAMES.pages);
}
