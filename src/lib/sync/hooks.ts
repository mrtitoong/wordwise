"use client";

import { useSyncExternalStore } from "react";
import { currentStatus, subscribe } from "./bridge";
import type { SyncStatus } from "./engine";

const subscribeOnline = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

/** true khi trình duyệt báo có mạng. Ở server coi như có mạng. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const SERVER_STATUS: SyncStatus = { state: "local", pending: 0, failed: 0, lastSyncedAt: null };

/** Trạng thái đồng bộ hiện tại (cập nhật mỗi khi engine đổi trạng thái). */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, currentStatus, () => SERVER_STATUS);
}
