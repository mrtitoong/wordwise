"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";

/** Bật/tắt "Luyện chính tả": thẻ Chính tả có trong phiên ôn hay không (mặc định bật). */
export function PracticeSpelling() {
  const t = useTranslations("settings");
  const owner = useOwner();
  const current = useLiveQuery(
    async () =>
      owner ? (await getLocalDb().user_settings.get(owner))?.practice_spelling : undefined,
    [owner],
  );
  const on = current ?? true;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby="practice-spelling-hint"
        disabled={owner === null}
        onClick={() => owner && void saveSettings(getLocalDb(), owner, { practice_spelling: !on })}
        className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="font-medium">{t("practiceSpelling")}</span>
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
      <p id="practice-spelling-hint" className="text-sm text-muted-foreground">
        {t("practiceSpellingHint")}
      </p>
    </div>
  );
}
