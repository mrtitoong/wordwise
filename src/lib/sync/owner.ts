"use client";

import { useSyncExternalStore } from "react";
import { currentOwner, subscribe } from "./bridge";

/**
 * Chủ dữ liệu hiện tại trong máy (user id, GUEST_OWNER khi là khách, null khi chưa biết). Không kéo
 * theo sync engine (xem bridge.ts) để trang hiện dữ liệu trong máy ngay.
 */
export function useOwner(): string | null {
  return useSyncExternalStore(subscribe, currentOwner, () => null);
}
