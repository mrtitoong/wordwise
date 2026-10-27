"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { listenForInstallPrompt } from "@/features/offline/install-prompt";

/**
 * Phần chạy nền không vẽ gì (đồng bộ, chạy tiếp việc nhập file, Service Worker và tải trước): chỉ
 * tải code sau khi trang tải xong, thêm một nhịp để nội dung chính (đọc từ IndexedDB) kịp hiện, và
 * khi trình duyệt rảnh – để không tranh mạng/CPU với lần mở đầu. Đồng bộ kéo theo Supabase và Zod; giao diện đọc
 * chủ dữ liệu qua lib/sync/bridge.ts nên không phải chờ.
 */
const SyncProvider = dynamic(
  () => import("@/components/sync/sync-provider").then((m) => m.SyncProvider),
  { ssr: false },
);
const ImportProvider = dynamic(
  () => import("@/features/import/import-provider").then((m) => m.ImportProvider),
  { ssr: false },
);
const OfflineSetup = dynamic(
  () => import("@/features/offline/offline-setup").then((m) => m.OfflineSetup),
  { ssr: false },
);

/** Sau khi trang tải xong, chờ chừng này để nội dung chính hiện trước. */
const AFTER_LOAD_MS = 1_500;
/** Rồi chờ trình duyệt rảnh tối đa chừng này. */
const IDLE_TIMEOUT_MS = 2_000;

function useAfterLoadIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Safari chưa có requestIdleCallback: chờ một chút sau khi tải xong.
    const hasIdle = typeof window.requestIdleCallback === "function";
    let idle = 0;
    let wait = 0;
    const go = () => {
      wait = window.setTimeout(() => {
        const run = () => setReady(true);
        idle = hasIdle
          ? window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
          : window.setTimeout(run, 0);
      }, AFTER_LOAD_MS);
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => {
      window.removeEventListener("load", go);
      window.clearTimeout(wait);
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);
  return ready;
}

export function DeferredProviders() {
  const ready = useAfterLoadIdle();
  // Sự kiện cài app có thể đến sớm: lắng nghe ngay (nhẹ), nút cài nằm ở Cài đặt.
  useEffect(() => listenForInstallPrompt(), []);
  if (!ready) return null;
  return (
    <>
      <SyncProvider />
      <ImportProvider />
      <OfflineSetup />
    </>
  );
}
