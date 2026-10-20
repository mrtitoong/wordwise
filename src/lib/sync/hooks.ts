"use client";

import { useSyncExternalStore } from "react";
import type { SyncStatus } from "./engine";
import { getSyncEngine } from "./client";

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
const noop = () => () => {};

/** Trạng thái đồng bộ hiện tại (cập nhật mỗi khi engine đổi trạng thái). */
export function useSyncStatus(): SyncStatus {
  const engine = typeof window === "undefined" ? null : getSyncEngine();
  return useSyncExternalStore(
    engine?.subscribe ?? noop,
    engine?.getStatus ?? (() => SERVER_STATUS),
    () => SERVER_STATUS,
  );
}
