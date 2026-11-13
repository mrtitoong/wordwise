"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { hapticsEnabled, hapticsSupported, setHapticsEnabled } from "@/features/review/haptics";
import { cn } from "@/lib/utils";

/** Cài đặt → Giao diện: "Rung khi trả lời". Ẩn trên máy không rung được (iPhone, máy tính). */
export function HapticsSwitch() {
  const t = useTranslations("settings");
  const hintId = useId();
  const [state, setState] = useState<{ supported: boolean; on: boolean } | null>(null);

  useEffect(() => {
    // Chỉ biết sau khi chạy trong trình duyệt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ supported: hapticsSupported(), on: hapticsEnabled() });
  }, []);

  if (!state?.supported) return null;
  const { on } = state;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hintId}
        onClick={() => {
          setHapticsEnabled(!on);
          setState({ supported: true, on: !on });
          if (!on) navigator.vibrate?.(12);
        }}
        className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-transparent bg-card px-4 text-left lift focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="font-medium">{t("haptics")}</span>
        <span
          aria-hidden
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            on ? "bg-primary" : "bg-muted-foreground/40",
          )}
        >
          <span
            className={cn(
              "absolute top-1 left-1 size-5 rounded-full bg-background shadow transition-transform",
              on && "translate-x-5",
            )}
          />
        </span>
      </button>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t("hapticsHint")}
      </p>
    </div>
  );
}
