/**
 * Service Worker của WordWise (đóng gói thành public/sw.js bằng `npm run sw:build`).
 * - Offline: lưu JS/CSS, các trang đã mở (và trang chính, xem SHELL_PAGES), audio/ảnh đã tải; quy
 *   tắc ở src/lib/offline/sw-policy.ts.
 * - Nhắc học (Prompt 6.3): nhận Web Push, bấm thông báo thì mở app.
 */
import {
  assetUrlsInHtml,
  CACHE_NAMES,
  chunkUrlsInScript,
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

/** Lưu một file JS/CSS (chưa có thì tải); trả về nội dung nếu là JS để tìm tiếp file nó gọi. */
async function saveAsset(statics: Cache, asset: string): Promise<string | null> {
  let res = await statics.match(asset);
  if (!res) {
    const fresh = await fetch(asset).catch(() => null);
    if (!fresh?.ok) return null;
    await statics.put(asset, fresh.clone());
    res = fresh;
  }
  return asset.endsWith(".js") ? res.text() : null;
}

/**
 * Lưu một trang và JS/CSS của nó (để mở offline chạy được). Bỏ qua trang bị chuyển hướng.
 * `deep` (lưu sẵn trang chính): lưu cả các file mà JS của trang có thể tải sau (import động) –
 * phần code tải khi cần (vd màn xem thẻ từ mới trong phiên ôn) cũng chạy được offline.
 */
async function savePage(url: string, response: Response, deep = false): Promise<boolean> {
  if (!response.ok || response.redirected || response.type !== "basic") return false;
  const html = await response.clone().text();
  const pages = await caches.open(CACHE_NAMES.pages);
  await pages.put(url, response);
  const statics = await caches.open(CACHE_NAMES.static);
  const queue = assetUrlsInHtml(html);
  const seen = new Set<string>();
  while (queue.length > 0) {
    const asset = queue.shift()!;
    if (seen.has(asset)) continue;
    seen.add(asset);
    if (!deep) {
      if (!(await statics.match(asset))) await saveAsset(statics, asset);
      continue;
    }
    const source = await saveAsset(statics, asset);
    if (source) queue.push(...chunkUrlsInScript(source).filter((next) => !seen.has(next)));
  }
  await trim(CACHE_NAMES.pages, PAGES_MAX_ENTRIES);
  await trim(CACHE_NAMES.static, STATIC_MAX_ENTRIES);
  return true;
}

/** Lưu sẵn các trang; trả về trang đã lưu được (trang bị chuyển hướng thì không). */
async function warmPages(paths: readonly string[]): Promise<string[]> {
  const saved: string[] = [];
  for (const path of paths) {
    const response = await fetch(path, { credentials: "same-origin" }).catch(() => null);
    const ok = response
      ? await savePage(new URL(path, ORIGIN).href, response, true).catch(() => false)
      : false;
    if (ok) saved.push(path);
  }
  return saved;
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

/**
 * App nhờ lưu sẵn trang chính: { type: "warm", pages: [...] }; xong thì trả lời qua port
 * { type: "warmed", saved: [...] }.
 */
sw.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { type?: string; pages?: string[] } | null;
  if (data?.type !== "warm" || !Array.isArray(data.pages)) return;
  event.waitUntil(
    warmPages(data.pages).then((saved) => event.ports[0]?.postMessage({ type: "warmed", saved })),
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
