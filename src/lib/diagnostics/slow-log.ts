/**
 * Nhật ký chậm: ghi lại lúc app chậm bất thường (luồng chính bị đứng, ghi IndexedDB lâu, đồng bộ
 * lâu, Service Worker lưu trang lâu) để tìm nguyên nhân treo trên điện thoại thật. Chỉ lưu trong
 * máy (localStorage, tối đa MAX_ENTRIES dòng mới nhất), không gửi đi; xem ở Cài đặt → Nhật ký chậm.
 */

export type SlowKind = "freeze" | "answer" | "write" | "sync" | "warm";

export type SlowEntry = {
  /** Thời điểm bắt đầu (ISO). */
  at: string;
  kind: SlowKind;
  /** Kéo dài bao lâu (ms). */
  ms: number;
  /** Chi tiết ngắn: bước nào, đang online hay không… */
  detail?: string;
};

/** Ngưỡng ghi theo loại (ms): ngắn hơn là bình thường. */
export const SLOW_THRESHOLD_MS: Record<SlowKind, number> = {
  freeze: 1_500,
  answer: 1_000,
  write: 2_000,
  sync: 10_000,
  warm: 30_000,
};

export const MAX_ENTRIES = 60;
export const SLOW_LOG_KEY = "ww_slow_log";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSlowLog(store: Storage | null = storage()): SlowEntry[] {
  try {
    const parsed = JSON.parse(store?.getItem(SLOW_LOG_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SlowEntry[]) : [];
  } catch {
    return [];
  }
}

/** Ghi một lần chậm nếu vượt ngưỡng của loại đó; trả về true khi đã ghi. */
export function recordSlow(
  kind: SlowKind,
  startedAt: number,
  ms: number,
  detail?: string,
  store: Storage | null = storage(),
): boolean {
  if (!store || ms < SLOW_THRESHOLD_MS[kind]) return false;
  const entry: SlowEntry = {
    at: new Date(startedAt).toISOString(),
    kind,
    ms: Math.round(ms),
    ...(detail ? { detail } : {}),
  };
  const entries = [...readSlowLog(store), entry].slice(-MAX_ENTRIES);
  try {
    store.setItem(SLOW_LOG_KEY, JSON.stringify(entries));
  } catch {
    return false;
  }
  return true;
}

export function clearSlowLog(store: Storage | null = storage()): void {
  try {
    store?.removeItem(SLOW_LOG_KEY);
  } catch {
    // bỏ qua
  }
}

/** Đo một việc bất đồng bộ, ghi vào nhật ký nếu lâu (kể cả khi lỗi). */
export async function timed<T>(kind: SlowKind, detail: string, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await work();
  } finally {
    recordSlow(kind, start, Date.now() - start, detail);
  }
}

/** Nhịp kiểm tra luồng chính. */
const TICK_MS = 500;

/**
 * Theo dõi luồng chính: nhịp hẹn giờ đến trễ nhiều nghĩa là trang bị đứng (JS bận, máy bị treo).
 * Tab ẩn thì trình duyệt tự làm chậm hẹn giờ nên không tính. Trả về hàm dừng.
 */
export function watchMainThread(): () => void {
  if (typeof window === "undefined") return () => undefined;
  let last = Date.now();
  const timer = window.setInterval(() => {
    const now = Date.now();
    const late = now - last - TICK_MS;
    if (document.visibilityState === "visible") {
      recordSlow("freeze", last, late, navigator.onLine ? "online" : "offline");
    }
    last = now;
  }, TICK_MS);
  return () => window.clearInterval(timer);
}

/** Dạng văn bản để sao chép gửi cho nhóm phát triển. */
export function formatSlowLog(entries: readonly SlowEntry[]): string {
  return entries
    .map((e) => `${e.at} ${e.kind} ${(e.ms / 1000).toFixed(1)}s${e.detail ? ` ${e.detail}` : ""}`)
    .join("\n");
}
