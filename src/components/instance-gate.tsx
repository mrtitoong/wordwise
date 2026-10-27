"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { INSTANCE_CHANNEL, nextInstanceState, type InstanceState } from "@/lib/sync/instance";

/**
 * Bao quanh app (cả phần chạy nền): khi nơi khác trên máy được mở lên dùng mà trang này đang ẩn,
 * trang này tạm nghỉ – gỡ giao diện (không còn truy vấn IndexedDB), đóng kết nối – để không giữ
 * bảng khi bị đóng băng. Hiện lại thì chạy lại (dữ liệu đọc mới từ IndexedDB). Xem lib/sync/instance.ts.
 */
export function InstanceGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("app");
  const [state, setState] = useState<InstanceState>("active");

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const id = crypto.randomUUID();
    const channel = new BroadcastChannel(INSTANCE_CHANNEL);
    const announce = () => channel.postMessage({ type: "active", id });
    channel.onmessage = (event: MessageEvent<{ type?: string; id?: string }>) => {
      if (event.data?.type !== "active" || event.data.id === id) return;
      setState((s) =>
        nextInstanceState(s, {
          type: "other-active",
          hidden: document.visibilityState === "hidden",
        }),
      );
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      setState((s) => nextInstanceState(s, { type: "visible" }));
      announce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") announce();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      channel.close();
    };
  }, []);

  useEffect(() => {
    // Giao diện đã gỡ: đóng kết nối (truy vấn sau sẽ tự mở lại khi chạy lại).
    if (state !== "dormant") return;
    void import("@/lib/db/local").then(({ getLocalDb }) =>
      getLocalDb().close({ disableAutoOpen: false }),
    );
  }, [state]);

  if (state === "dormant") {
    return (
      <p role="status" className="px-4 py-24 text-center text-muted-foreground">
        {t("otherWindow")}
      </p>
    );
  }
  return children;
}
