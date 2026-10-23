/*
 * Service Worker tối giản cho nhắc học (Prompt 6.3): chỉ nhận Web Push và mở app khi bấm thông
 * báo. Không cache trang (chế độ offline đầy đủ của PWA làm ở GĐ8).
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "WordWise", {
      body: data.body || "",
      tag: data.tag || "daily-reminder",
      renotify: false,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        open.navigate(url).catch(() => undefined);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
