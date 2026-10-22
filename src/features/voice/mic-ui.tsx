"use client";

import { Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { RecorderError } from "./recorder";

/** Giải thích trước khi trình duyệt hỏi quyền micro (chỉ lần đầu). */
export function MicExplainSheet({
  open,
  onAllow,
  onCancel,
}: {
  open: boolean;
  onAllow: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("mic");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onCancel()} title={t("explainTitle")}>
      <div className="flex flex-col gap-3 text-sm">
        <p>{t("explainWhy")}</p>
        <p className="text-muted-foreground">{t("explainPrivacy")}</p>
        <p className="text-muted-foreground">{t("explainPrompt")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" onClick={onCancel}>
          {t("later")}
        </Button>
        <Button className="min-h-11" onClick={onAllow}>
          <Mic aria-hidden />
          {t("allow")}
        </Button>
      </div>
    </Sheet>
  );
}

/** Không thu được: hướng dẫn bật lại quyền micro theo trình duyệt. */
export function MicErrorHelp({ error }: { error: RecorderError }) {
  const t = useTranslations("mic");
  const ios =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent ?? "");
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 p-3 text-sm">
      <MicOff className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t(`error.${error}`)}</p>
        {error === "not-allowed" && (
          <p className="text-muted-foreground">{t(ios ? "fixIos" : "fixBrowser")}</p>
        )}
      </div>
    </div>
  );
}

/** Sóng âm khi đang thu: các cột cao theo âm lượng gần đây. */
export function LevelMeter({ levels, active }: { levels: readonly number[]; active: boolean }) {
  const t = useTranslations("mic");
  return (
    <div
      className="flex h-12 items-center justify-center gap-0.5"
      role="img"
      aria-label={t(active ? "listening" : "meter")}
    >
      {Array.from({ length: 28 }, (_, i) => {
        const level = levels[levels.length - 28 + i] ?? 0;
        return (
          <span
            key={i}
            className={cn(
              "w-1.5 rounded-full transition-[height] duration-75",
              active ? "bg-primary" : "bg-muted-foreground/30",
            )}
            style={{ height: `${Math.max(8, level * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
