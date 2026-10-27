"use client";

import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { syncNow } from "@/lib/sync/bridge";
import { useSyncStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";

/** Biểu tượng trạng thái đồng bộ trên thanh tiêu đề; bấm để đồng bộ ngay. */
export function SyncStatusIcon() {
  const t = useTranslations("sync");
  const { state, pending } = useSyncStatus();

  const icon = {
    local: Cloud,
    idle: pending > 0 ? Cloud : CloudCheck,
    syncing: RefreshCw,
    offline: CloudOff,
    error: CloudAlert,
  }[state];
  const Icon = icon;
  const label =
    state === "offline"
      ? t("offline", { count: pending })
      : state === "idle" && pending > 0
        ? t("pending", { count: pending })
        : t(state);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-sync-state={state}
      onClick={syncNow}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        state === "error" && "text-destructive",
      )}
    >
      <Icon className={cn("size-5", state === "syncing" && "animate-spin")} aria-hidden />
      {pending > 0 && state !== "local" && (
        <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
          {pending > 99 ? "99+" : pending}
        </span>
      )}
    </button>
  );
}
