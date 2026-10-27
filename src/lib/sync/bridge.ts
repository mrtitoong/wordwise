"use client";

import { GUEST_OWNER } from "@/lib/db/ids";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { SyncStatus } from "./engine";

/**
 * Cầu nối nhẹ giữa giao diện và sync engine. Engine kéo theo Supabase và Zod (nặng) nên chỉ tải sau
 * khi trang đã hiện (SyncProvider nằm trong DeferredProviders); trong lúc đó giao diện vẫn biết chủ
 * dữ liệu nhờ gợi ý lưu trong máy (chủ gần nhất) để đọc IndexedDB ngay. Engine sẵn sàng thì nó là
 * nguồn đúng: phiên đăng nhập khác gợi ý thì giao diện đổi theo.
 *
 * Gợi ý chỉ để chọn dữ liệu trong máy mà đọc – dữ liệu đó vốn đã nằm trên máy này; quyền thật do
 * Supabase Auth + RLS.
 */
export type EngineLike = {
  getOwner(): string | null;
  getStatus(): SyncStatus;
  subscribe(listener: () => void): () => void;
  syncNow(): Promise<SyncStatus>;
};

const OWNER_KEY = "ww_owner";
const LOCAL_STATUS: SyncStatus = { state: "local", pending: 0, failed: 0, lastSyncedAt: null };

let engine: EngineLike | null = null;
let hint: string | null | undefined;
const listeners = new Set<() => void>();

/** Cookie phiên đăng nhập của Supabase (@supabase/ssr: sb-<project>-auth-token, có thể chia .0, .1). */
const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

function readHint(): string | null {
  if (hint === undefined) {
    try {
      hint = localStorage.getItem(OWNER_KEY);
    } catch {
      hint = null;
    }
  }
  // Chưa có gợi ý (máy mới, đã xóa dữ liệu) mà không có phiên đăng nhập: chắc chắn là khách.
  if (hint === null && (!getSupabaseEnv() || !AUTH_COOKIE.test(document.cookie))) {
    return GUEST_OWNER;
  }
  return hint;
}

function saveHint(owner: string | null) {
  if (!owner || owner === hint) return;
  hint = owner;
  try {
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // Không lưu được thì lần sau chờ engine như trước.
  }
}

const emit = () => listeners.forEach((listener) => listener());

/** Gọi một lần khi engine được tạo (lib/sync/client.ts). */
export function attachEngine(next: EngineLike) {
  engine = next;
  next.subscribe(() => {
    saveHint(next.getOwner());
    emit();
  });
  saveHint(next.getOwner());
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chủ dữ liệu: theo engine khi đã biết, chưa thì theo gợi ý trong máy (null khi chưa có gì). */
export function currentOwner(): string | null {
  return engine?.getOwner() ?? readHint();
}

export function currentStatus(): SyncStatus {
  return engine?.getStatus() ?? LOCAL_STATUS;
}

/** Bấm biểu tượng đồng bộ: engine chưa tải xong thì bỏ qua (nó sẽ tự đồng bộ khi khởi động). */
export function syncNow() {
  void engine?.syncNow();
}
