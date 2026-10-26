/**
 * Phía app của chế độ offline: đăng ký Service Worker (public/sw.js), nhờ nó lưu sẵn trang chính,
 * xóa trang đã lưu khi đăng xuất. Chỉ bản build thật (next dev không dùng Service Worker).
 */
import { CACHE_NAMES, SHELL_PAGES } from "@/lib/offline/sw-policy";

const WARM_KEY = "ww_sw_warm";
/** Lưu lại trang chính tối đa mỗi giờ một lần (hoặc ngay khi vừa xong onboarding/đăng nhập). */
const WARM_EVERY_MS = 60 * 60 * 1000;

export function offlineSupported(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  );
}

/** Đã bắt đầu dùng app (khách hoặc tài khoản đã xong onboarding): trang chính mở được để lưu. */
function startedState(): string {
  return /(?:^|;\s*)ww_onboarded=1/.test(document.cookie) ? "onboarded" : "new";
}

function shouldWarm(now: number): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(WARM_KEY) ?? "null") as {
      at: number;
      state: string;
    } | null;
    return !saved || saved.state !== startedState() || now - saved.at > WARM_EVERY_MS;
  } catch {
    return true;
  }
}

function markWarmed(now: number) {
  try {
    localStorage.setItem(WARM_KEY, JSON.stringify({ at: now, state: startedState() }));
  } catch {
    // Không lưu được (chế độ riêng tư): lần mở sau lưu lại, không sao.
  }
}

let registering: Promise<ServiceWorkerRegistration> | null = null;
let warming = false;

/**
 * Đăng ký Service Worker và lưu sẵn trang chính (gọi mỗi lần đổi trang: chỉ lưu khi vừa xong
 * onboarding/đăng nhập hoặc đã quá một giờ). Trả về khi đã lưu xong (hoặc bỏ qua).
 */
export async function setUpOffline(): Promise<void> {
  if (!offlineSupported()) return;
  registering ??= navigator.serviceWorker.register("/sw.js");
  const registration = await registering;
  await navigator.serviceWorker.ready;
  const now = Date.now();
  if (warming || !navigator.onLine || startedState() === "new" || !shouldWarm(now)) return;
  const worker = registration.active;
  if (!worker) return;
  warming = true;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    worker.postMessage({ type: "warm", pages: [...SHELL_PAGES] }, [channel.port2]);
    // Không chờ mãi nếu Service Worker bị thay giữa chừng.
    setTimeout(resolve, 60_000);
  }).finally(() => {
    warming = false;
  });
  markWarmed(now);
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
