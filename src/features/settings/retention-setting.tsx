"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { DEFAULT_DAILY_NEW } from "@/lib/onboarding/settings";
import {
  DEFAULT_RETENTION,
  estimateDailyReviews,
  nearestRetention,
  RETENTION_OPTIONS,
} from "@/lib/srs/retention";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";

/**
 * Tỉ lệ nhớ mong muốn 80–95% (Prompt 6.3): chọn một mức thì xem ước tính số thẻ ôn/ngày trước,
 * bấm Lưu mới đổi. Chỉ ảnh hưởng các lần ôn sau (lịch đã xếp giữ nguyên).
 */
export function RetentionSetting() {
  const t = useTranslations("settings.retention");
  const owner = useOwner();
  const settings = useLiveQuery(
    async () => (owner ? ((await getLocalDb().user_settings.get(owner)) ?? null) : undefined),
    [owner],
  );
  const saved = nearestRetention(settings?.desired_retention ?? DEFAULT_RETENTION);
  const [picked, setPicked] = useState<number | null>(null);
  const choice = picked ?? saved;
  const newPerDay = settings?.daily_new_limit ?? DEFAULT_DAILY_NEW;
  const spelling = settings?.practice_spelling ?? true;
  const limit = settings?.daily_review_limit ?? 200;
  const estimate = (r: number) => estimateDailyReviews(newPerDay, r, spelling);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={t("title")}
        aria-busy={settings === undefined}
        className="grid grid-cols-4 gap-2"
      >
        {RETENTION_OPTIONS.map((r) => {
          const selected = r === choice;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={settings === undefined}
              onClick={() => setPicked(r)}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1 rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
              )}
            >
              {Math.round(r * 100)}%
              {r === saved && <Check className="size-4 text-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="text-sm" role="status">
        {t("estimate", { count: estimate(choice), newPerDay })}
        {choice !== saved &&
          ` ${t("compare", { count: estimate(saved), percent: Math.round(saved * 100) })}`}
        {estimate(choice) > limit && ` ${t("overLimit", { limit })}`}
      </p>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {choice !== saved && owner && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setPicked(null)}>
            {t("cancel")}
          </Button>
          <Button
            className="min-h-11"
            onClick={() =>
              void saveSettings(getLocalDb(), owner, { desired_retention: choice }).then(() =>
                setPicked(null),
              )
            }
          >
            {t("save", { percent: Math.round(choice * 100) })}
          </Button>
        </div>
      )}
    </div>
  );
}
