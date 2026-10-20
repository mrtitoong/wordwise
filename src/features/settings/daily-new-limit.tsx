"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { DAILY_NEW_OPTIONS, DEFAULT_DAILY_NEW } from "@/lib/onboarding/settings";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";

/** Đổi số từ mới/ngày: ghi vào máy trước (dùng được khi offline), đồng bộ sau. */
export function DailyNewLimit() {
  const t = useTranslations();
  const owner = useOwner();
  const current = useLiveQuery(
    async () =>
      owner ? (await getLocalDb().user_settings.get(owner))?.daily_new_limit : undefined,
    [owner],
  );
  const value = current ?? DEFAULT_DAILY_NEW;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={t("settings.dailyNew")}
        aria-busy={owner === null}
        className="grid grid-cols-4 gap-2"
      >
        {DAILY_NEW_OPTIONS.map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={owner === null}
              onClick={() =>
                owner && void saveSettings(getLocalDb(), owner, { daily_new_limit: n })
              }
              className={cn(
                "flex min-h-12 items-center justify-center gap-1 rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
              )}
            >
              {n}
              {selected && <Check className="size-4 text-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{t("settings.dailyNewHint")}</p>
    </div>
  );
}
