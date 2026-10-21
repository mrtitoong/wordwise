"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type ToastMessage = {
  text: string;
  /** Nút phụ (vd Hoàn tác); bấm thì toast đóng. */
  action?: { label: string; run: () => void };
};

/**
 * Toast dùng chung toàn app (giữ được khi chuyển trang, vd xóa sổ rồi về danh sách vẫn
 * Hoàn tác được). Tự ẩn sau 5 giây.
 */
let current: ToastMessage | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function showToast(message: ToastMessage, ms = 5000) {
  clearTimeout(timer);
  current = message;
  emit();
  timer = setTimeout(hideToast, ms);
}

export function hideToast() {
  clearTimeout(timer);
  current = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Đặt một lần trong layout gốc. */
export function ToastViewport() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-foreground py-1 pr-1 pl-4 text-sm text-background shadow-lg transition-opacity",
        toast ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <span className="py-2">{toast?.text}</span>
      {toast?.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.run();
            hideToast();
          }}
          className="min-h-11 shrink-0 rounded-full px-3 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          {toast.action.label}
        </button>
      )}
      {!toast?.action && <span className="pr-3" />}
    </div>
  );
}
