"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import {
  clearSlowLog,
  formatSlowLog,
  readSlowLog,
  type SlowEntry,
} from "@/lib/diagnostics/slow-log";

/** Hiện tối đa chừng này dòng (mới nhất trước); Sao chép lấy đủ cả nhật ký. */
const SHOWN = 20;

// localStorage chỉ có ở trình duyệt: server render rỗng, đọc sau khi hydrate.
let snapshot: SlowEntry[] | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Rời Cài đặt: lần mở sau đọc lại nhật ký mới.
    if (listeners.size === 0) snapshot = null;
  };
};
const getSnapshot = () => (snapshot ??= readSlowLog());

function clear() {
  clearSlowLog();
  snapshot = [];
  listeners.forEach((listener) => listener());
}

/** Cài đặt → Nhật ký chậm: các lần app chậm bất thường trên máy này, để gửi cho nhóm phát triển. */
export function SlowLogCard() {
  const t = useTranslations("settings.slowLog");
  const entries = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!entries) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatSlowLog(entries!));
      showToast({ text: t("copied") });
    } catch {
      showToast({ text: t("copyFailed") });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {entries.length === 0 ? (
        <p className="text-sm">{t("empty")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1 font-mono text-xs" aria-label={t("title")}>
            {entries
              .slice(-SHOWN)
              .reverse()
              .map((e) => (
                <li key={`${e.at}-${e.kind}-${e.ms}`} className="break-all">
                  {new Date(e.at).toLocaleString()} · {t(`kind.${e.kind}`)} ·{" "}
                  {(e.ms / 1000).toFixed(1)}s{e.detail ? ` · ${e.detail}` : ""}
                </li>
              ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => void copy()}>
              {t("copy")}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={clear}>
              {t("clear")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
