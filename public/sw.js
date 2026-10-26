// File sinh tự động từ src/sw/sw.ts bởi scripts/build-sw.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run sw:build`.
"use strict";
(() => {
  // src/lib/offline/sw-policy.ts
  var VERSION = 1;
  var CACHE_NAMES = {
    static: `ww-static-v${VERSION}`,
    pages: `ww-pages-v${VERSION}`,
    media: `ww-media-v${VERSION}`
  };
  var OFFLINE_PAGE = "/offline";
  var MEDIA_MAX_ENTRIES = 1500;
  var STATIC_MAX_ENTRIES = 400;
  var PAGES_MAX_ENTRIES = 80;
  var NAVIGATION_TIMEOUT_MS = 5e3;
  var ONLINE_ONLY = ["/auth", "/login", "/admin", "/api"];
  var IMAGE_HOSTS = ["images.pexels.com", "images.unsplash.com", "plus.unsplash.com"];
  function startsWithPath(pathname, base) {
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  function classifyRequest(request, origin) {
    if (request.method !== "GET") return "bypass";
    let url;
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
  function assetUrlsInHtml(html) {
    const found = html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [];
    return [...new Set(found)];
  }
  function keysToTrim(keys, max) {
    return keys.length > max ? keys.slice(0, keys.length - max) : [];
  }
  function parseRange(header, size) {
    const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || match[1] === "" && match[2] === "") return null;
    let start;
    let end;
    if (match[1] === "") {
      start = Math.max(0, size - Number(match[2]));
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    return start <= end && start < size ? { start, end } : null;
  }

  // src/sw/sw.ts
  var sw = self;
  var ORIGIN = sw.location.origin;
  async function trim(cacheName, max) {
    const cache = await caches.open(cacheName);
    for (const key of keysToTrim(await cache.keys(), max)) await cache.delete(key);
  }
  async function savePage(url, response) {
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
  async function warmPages(paths) {
    for (const path of paths) {
      const response = await fetch(path, { credentials: "same-origin" }).catch(() => null);
      if (response) await savePage(new URL(path, ORIGIN).href, response).catch(() => void 0);
    }
  }
  async function cachedPage(request) {
    const pages = await caches.open(CACHE_NAMES.pages);
    return await pages.match(request) ?? await pages.match(request.url, { ignoreSearch: true }) ?? void 0;
  }
  async function handlePage(event) {
    const network = fetch(event.request).then((response) => {
      event.waitUntil(savePage(event.request.url, response.clone()).catch(() => void 0));
      return response;
    });
    network.catch(() => void 0);
    const cached = await cachedPage(event.request);
    try {
      if (!cached) return await network;
      const timeout = new Promise(
        (resolve) => setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS)
      );
      return await Promise.race([network, timeout]);
    } catch {
      if (cached) return cached;
      const offline = await caches.match(new URL(OFFLINE_PAGE, ORIGIN).href);
      return offline ?? Response.error();
    }
  }
  async function handleStatic(request) {
    const cache = await caches.open(CACHE_NAMES.static);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  }
  async function withRange(request, response) {
    const header = request.headers.get("range");
    if (!header) return response;
    const blob = await response.blob();
    const range = parseRange(header, blob.size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${blob.size}` }
      });
    }
    return new Response(blob.slice(range.start, range.end + 1), {
      status: 206,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
        "Content-Range": `bytes ${range.start}-${range.end}/${blob.size}`,
        "Content-Length": String(range.end - range.start + 1),
        "Accept-Ranges": "bytes"
      }
    });
  }
  async function handleMedia(event) {
    const { request } = event;
    const cache = await caches.open(CACHE_NAMES.media);
    const hit = await cache.match(request.url);
    if (hit) return withRange(request, hit);
    const full = await fetch(request.url, { mode: "cors", credentials: "omit" }).catch(() => null);
    if (!full?.ok) return fetch(request);
    event.waitUntil(
      cache.put(request.url, full.clone()).then(() => trim(CACHE_NAMES.media, MEDIA_MAX_ENTRIES)).catch(() => void 0)
    );
    return withRange(request, full);
  }
  sw.addEventListener("install", (event) => {
    event.waitUntil(warmPages([OFFLINE_PAGE]).then(() => sw.skipWaiting()));
  });
  sw.addEventListener("activate", (event) => {
    const current = new Set(Object.values(CACHE_NAMES));
    event.waitUntil(
      caches.keys().then(
        (names) => Promise.all(
          names.filter((n) => n.startsWith("ww-") && !current.has(n)).map((n) => caches.delete(n))
        )
      ).then(() => sw.clients.claim())
    );
  });
  sw.addEventListener("fetch", (event) => {
    const kind = classifyRequest(event.request, ORIGIN);
    if (kind === "page") event.respondWith(handlePage(event));
    else if (kind === "static") event.respondWith(handleStatic(event.request));
    else if (kind === "media") event.respondWith(handleMedia(event));
  });
  sw.addEventListener("message", (event) => {
    const data = event.data;
    if (data?.type !== "warm" || !Array.isArray(data.pages)) return;
    event.waitUntil(
      warmPages(data.pages).then(() => event.ports[0]?.postMessage({ type: "warmed" }))
    );
  });
  sw.addEventListener("push", (event) => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = { body: event.data ? event.data.text() : "" };
    }
    event.waitUntil(
      sw.registration.showNotification(data.title || "WordWise", {
        body: data.body || "",
        tag: data.tag || "daily-reminder",
        data: { url: data.url || "/" }
      })
    );
  });
  sw.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "/", ORIGIN).href;
    event.waitUntil(
      sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
        const open = windows.find((w) => new URL(w.url).origin === ORIGIN);
        if (open) {
          open.navigate(url).catch(() => void 0);
          return open.focus();
        }
        return sw.clients.openWindow(url);
      })
    );
  });
})();
