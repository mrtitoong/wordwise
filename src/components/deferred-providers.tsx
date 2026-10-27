"use client";

import dynamic from "next/dynamic";

/**
 * Phần chạy nền không vẽ gì (chạy tiếp việc nhập file, Service Worker và tải trước, cài app): tải
 * code sau khi trang đã hiện để không làm chậm lần mở đầu.
 */
const ImportProvider = dynamic(
  () => import("@/features/import/import-provider").then((m) => m.ImportProvider),
  { ssr: false },
);
const OfflineSetup = dynamic(
  () => import("@/features/offline/offline-setup").then((m) => m.OfflineSetup),
  { ssr: false },
);

export function DeferredProviders() {
  return (
    <>
      <ImportProvider />
      <OfflineSetup />
    </>
  );
}
