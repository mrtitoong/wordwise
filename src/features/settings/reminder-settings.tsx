"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { saveSettings } from "@/lib/db/repo";
import { DEFAULT_REMINDER } from "@/lib/onboarding/settings";
import { reminderInputValue, type PushSupport } from "@/lib/push/support";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";
import {
  currentPushSupport,
  hasPushSubscription,
  subscribeReminders,
  unsubscribeReminders,
  type SubscribeResult,
} from "./push-client";

/**
 * Nhắc học (Prompt 6.3): bật/tắt và giờ nhắc. Bật thì xin quyền thông báo và đăng ký trình duyệt
 * này với máy chủ; giờ nhắc lưu vào user_settings (đồng bộ). Máy chủ chỉ nhắc khi hôm đó chưa học,
 * tối đa 1 lần/ngày.
 */
export function ReminderSettings() {
  const t = useTranslations("settings.reminder");
  const owner = useOwner();
  const hintId = useId();
  const time = useLiveQuery(
    async () =>
      owner ? ((await getLocalDb().user_settings.get(owner))?.reminder_time ?? null) : undefined,
    [owner],
  );
  // Chỉ có ở trình duyệt; lần render đầu (cả ở server) đều là khung chờ vì chưa có owner.
  const [support, setSupport] = useState<PushSupport | null>(() =>
    typeof window === "undefined" ? null : currentPushSupport(),
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubscribeResult | null>(null);

  useEffect(() => {
    void hasPushSubscription().then(setSubscribed);
  }, []);

  if (owner === null || time === undefined || support === null) {
    return <div className="h-12 animate-pulse rounded-xl bg-muted" aria-hidden />;
  }

  if (owner === GUEST_OWNER) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm">{t("guest")}</p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/login?next=%2Fsettings">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  const on = time !== null;

  async function enable(value: string) {
    setBusy(true);
    setResult(null);
    const outcome = await subscribeReminders({ ask: true });
    setResult(outcome);
    setSupport(currentPushSupport());
    if (outcome === "ok") {
      setSubscribed(true);
      await saveSettings(getLocalDb(), owner!, { reminder_time: `${value}:00` });
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setResult(null);
    await unsubscribeReminders().catch(() => undefined);
    setSubscribed(false);
    await saveSettings(getLocalDb(), owner!, { reminder_time: null });
    setBusy(false);
  }

  const value = reminderInputValue(time, DEFAULT_REMINDER);
  const problem: string | null =
    support === "ios-install"
      ? t("iosInstall")
      : support === "unsupported"
        ? t("unsupported")
        : support === "denied" || result === "denied"
          ? t("denied")
          : result === "error"
            ? t("error")
            : on && subscribed === false
              ? t("notOnThisDevice")
              : null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hintId}
        disabled={busy || (!on && support !== "ok")}
        onClick={() => void (on ? disable() : enable(value))}
        className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
      >
        <span className="font-medium">{t("toggle")}</span>
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
      {on && (
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4">
          {t("at")}
          <input
            type="time"
            required
            value={value}
            disabled={busy}
            onChange={(e) =>
              e.target.value &&
              void saveSettings(getLocalDb(), owner, { reminder_time: `${e.target.value}:00` })
            }
            className="h-11 rounded-lg bg-muted px-3 text-base"
          />
        </label>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {t("hint")}
      </p>
      {problem && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm">
          <p>{problem}</p>
          {on && subscribed === false && support === "ok" && result !== "denied" && (
            <Button className="min-h-11" disabled={busy} onClick={() => void enable(value)}>
              {t("enableHere")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
