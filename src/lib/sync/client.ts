"use client";

import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { onLocalWrite } from "@/lib/db/repo";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { attachEngine } from "./bridge";
import { SyncEngine } from "./engine";
import { createSupabaseRemote } from "./remote";

let engine: SyncEngine | null = null;

/** Sync engine dùng chung trong trình duyệt (null ở server). */
export function getSyncEngine(): SyncEngine | null {
  if (typeof window === "undefined") return null;
  if (!engine) {
    const remote = getSupabaseEnv() ? createSupabaseRemote(createClient()) : null;
    engine = new SyncEngine(getLocalDb(), remote);
    onLocalWrite(() => engine?.schedule());
    attachEngine(engine);
  }
  return engine;
}

/** Đồng bộ nhưng không chờ quá lâu (vd trước khi chuyển trang). */
export async function syncWithTimeout(ms = 8000): Promise<void> {
  const current = getSyncEngine();
  if (!current) return;
  await Promise.race([current.syncNow(), new Promise((resolve) => setTimeout(resolve, ms))]);
}

/**
 * Chủ dữ liệu theo phiên đăng nhập hiện tại (đọc trực tiếp, không chờ
 * SyncProvider) và báo cho sync engine.
 */
export async function resolveOwner(): Promise<string> {
  let owner = GUEST_OWNER;
  if (getSupabaseEnv()) {
    const { data } = await createClient().auth.getSession();
    owner = data.session?.user.id ?? GUEST_OWNER;
  }
  const current = getSyncEngine();
  if (current && current.getOwner() !== owner) await current.setOwner(owner);
  return owner;
}
