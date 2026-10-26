/**
 * Service Worker của WordWise (đóng gói thành public/sw.js bằng `npm run sw:build`).
 * - Offline: lưu JS/CSS, các trang đã mở (và trang chính, xem SHELL_PAGES), audio/ảnh đã tải; quy
 *   tắc ở src/lib/offline/sw-policy.ts.
 * - Nhắc học (Prompt 6.3): nhận Web Push, bấm thông báo thì mở app.
 */
import {
  assetUrlsInHtml,
  CACHE_NAMES,
  classifyRequest,
  keysToTrim,
  MEDIA_MAX_ENTRIES,
  NAVIGATION_TIMEOUT_MS,
  OFFLINE_PAGE,
  PAGES_MAX_ENTRIES,
  parseRange,
  STATIC_MAX_ENTRIES,
} from "@/lib/offline/sw-policy";

// Kiểu tối thiểu của môi trường Service Worker (tsconfig dùng lib DOM, không có "webworker").
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
};
type MessageEvent = ExtendableEvent & {
  data: unknown;
  ports: readonly MessagePort[];
};
type PushEvent = ExtendableEvent & { data: { json(): unknown; text(): string } | null };
type NotificationEvent = ExtendableEvent & {
  notification: Notification & { data?: { url?: string } };
};
type WindowClient = {
  url: string;
  focus(): Promise<unknown>;
  navigate(url: string): Promise<unknown>;
};
type Scope = {
  location: Location;
  registration: ServiceWorkerRegistration;
  clients: {
    claim(): Promise<void>;
    matchAll(options: object): Promise<WindowClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: never) => void): void;
};

const sw = self as unknown as Scope;
const ORIGIN = sw.location.origin;

async function trim(cacheName: string, max: number) {
  const cache = await caches.open(cacheName);
  for (const key of keysToTrim(await cache.keys(), max)) await cache.delete(key);
}

/** Lưu một trang và JS/CSS của nó (để mở offline chạy được). Bỏ qua trang bị chuyển hướng. */
async function savePage(url: string, response: Response) {
  if (!response.ok || response.redirected || response.type !== "basic") return;
  const html = await response.clone().text();
  const pages = await caches.open(CACHE_NAMES.pages);
  await pages.put(url, response);
  const statics = await caches.open(CACHE_NAMES.static);
  for (const asset of assetUrlsInHtml(html)) {
    if (await statics.match(asset)) continue;
    const res = await fetch(asset).catch(() => null);
    if (res?.ok) await statics.put(asset, res);
  }
  await trim(CACHE_NAMES.pages, PAGES_MAX_ENTRIES);
  await trim(CACHE_NAMES.static, STATIC_MAX_ENTRIES);
}

async function warmPages(paths: readonly string[]) {
  for (const path of paths) {
    const response = await fetch(path, { credentials: "same-origin" }).catch(() => null);
    if (response) await savePage(new URL(path, ORIGIN).href, response).catch(() => undefined);
  }
}

async function cachedPage(request: Request): Promise<Response | undefined> {
  const pages = await caches.open(CACHE_NAMES.pages);
  return (
    (await pages.match(request)) ??
    (await pages.match(request.url, { ignoreSearch: true })) ??
    undefined
  );
}

/** Mở trang: mạng trước (lưu bản mới); mất mạng/chậm thì bản đã lưu; chưa có thì /offline. */
async function handlePage(event: FetchEvent): Promise<Response> {
  const network = fetch(event.request).then((response) => {
    event.waitUntil(savePage(event.request.url, response.clone()).catch(() => undefined));
    return response;
  });
  // Đã trả bản lưu vì mạng chậm: lỗi mạng sau đó không cần báo.
  network.catch(() => undefined);
  const cached = await cachedPage(event.request);
  try {
    if (!cached) return await network;
    const timeout = new Promise<Response>((resolve) =>
      setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS),
    );
    return await Promise.race([network, timeout]);
  } catch {
    if (cached) return cached;
    const offline = await caches.match(new URL(OFFLINE_PAGE, ORIGIN).href);
    return offline ?? Response.error();
  }
}

async function handleStatic(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAMES.static);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

/** Cắt đoạn byte cho thẻ <audio> (Safari cần trả 206 khi audio lấy từ bộ nhớ). */
async function withRange(request: Request, response: Response): Promise<Response> {
  const header = request.headers.get("range");
  if (!header) return response;
  const blob = await response.blob();
  const range = parseRange(header, blob.size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${blob.size}` },
    });
  }
  return new Response(blob.slice(range.start, range.end + 1), {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Content-Range": `bytes ${range.start}-${range.end}/${blob.size}`,
      "Content-Length": String(range.end - range.start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

/** Audio, ảnh: lấy từ máy nếu đã có; chưa có thì tải cả file (không theo Range) rồi lưu. */
async function handleMedia(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(CACHE_NAMES.media);
  const hit = await cache.match(request.url);
  if (hit) return withRange(request, hit);
  // Thẻ <img> gửi không kèm CORS (opaque, không đọc được kích thước): lưu bản CORS nếu máy chủ cho.
  const full = await fetch(request.url, { mode: "cors", credentials: "omit" }).catch(() => null);
  if (!full?.ok) return fetch(request);
  event.waitUntil(
    cache
      .put(request.url, full.clone())
      .then(() => trim(CACHE_NAMES.media, MEDIA_MAX_ENTRIES))
      .catch(() => undefined),
  );
  return withRange(request, full);
}

sw.addEventListener("install", (event: ExtendableEvent) => {
  // Trang báo mất mạng luôn có sẵn.
  event.waitUntil(warmPages([OFFLINE_PAGE]).then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (event: ExtendableEvent) => {
  const current = new Set<string>(Object.values(CACHE_NAMES));
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n.startsWith("ww-") && !current.has(n)).map((n) => caches.delete(n)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event: FetchEvent) => {
  const kind = classifyRequest(event.request, ORIGIN);
  if (kind === "page") event.respondWith(handlePage(event));
  else if (kind === "static") event.respondWith(handleStatic(event.request));
  else if (kind === "media") event.respondWith(handleMedia(event));
});

/** App nhờ lưu sẵn trang chính: { type: "warm", pages: [...] }; xong thì trả lời qua port. */
sw.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { type?: string; pages?: string[] } | null;
  if (data?.type !== "warm" || !Array.isArray(data.pages)) return;
  event.waitUntil(
    warmPages(data.pages).then(() => event.ports[0]?.postMessage({ type: "warmed" })),
  );
});

sw.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = (event.data ? event.data.json() : {}) as typeof data;
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    sw.registration.showNotification(data.title || "WordWise", {
      body: data.body || "",
      tag: data.tag || "daily-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

sw.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", ORIGIN).href;
  event.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === ORIGIN);
      if (open) {
        open.navigate(url).catch(() => undefined);
        return open.focus();
      }
      return sw.clients.openWindow(url);
    }),
  );
});
