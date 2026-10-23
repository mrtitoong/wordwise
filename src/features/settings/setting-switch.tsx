"use client";

import { useId } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import type { UserSettingsRow } from "@/lib/db/types";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";

type BooleanSetting = "practice_spelling" | "practice_speaking" | "multi_accent";

const DEFAULTS: Record<BooleanSetting, boolean> = {
  practice_spelling: true,
  practice_speaking: false,
  multi_accent: false,
};

/**
 * Công tắc bật/tắt một cài đặt (ghi vào máy trước, đồng bộ sau): "Luyện chính tả", "Luyện phát âm" (thẻ có
 * trong phiên ôn), "Luyện nhiều giọng" (tập nghe đổi ngẫu nhiên giọng Mỹ/Anh).
 */
export function SettingSwitch({
  field,
  label,
  hint,
}: {
  field: BooleanSetting;
  label: "practiceSpelling" | "practiceSpeaking" | "multiAccent";
  hint: "practiceSpellingHint" | "practiceSpeakingHint" | "multiAccentHint";
}) {
  const t = useTranslations("settings");
  const owner = useOwner();
  const hintId = useId();
  const current = useLiveQuery(
    async () =>
      owner
        ? ((await getLocalDb().user_settings.get(owner)) as UserSettingsRow | undefined)?.[field]
        : undefined,
    [owner, field],
  );
  const on = current ?? DEFAULTS[field];

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hintId}
        disabled={owner === null}
        onClick={() => owner && void saveSettings(getLocalDb(), owner, { [field]: !on })}
        className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="font-medium">{t(label)}</span>
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
        {t(hint)}
      </p>
    </div>
  );
}
