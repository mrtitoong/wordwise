"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CalendarClock, Library } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import {
  cacheListContent,
  fetchLibraryList,
  fetchListWords,
  fetchReleases,
} from "@/features/library/library-data";
import { formatDay } from "@/features/library/shared";
import {
  acceptListUpdate,
  setTargetDate,
  skipListUpdate,
  type ListItem,
} from "@/lib/db/library-repo";
import { getLocalDb } from "@/lib/db/local";
import { defaultSettingsRow, openNewWords } from "@/lib/db/repo";
import type { NotebookRow } from "@/lib/db/types";
import { pendingListWords } from "@/lib/library/library";
import { studyDay } from "@/lib/review/day";
import { defaultTargetDate, minTargetDate, notebookProgress, previewPlan } from "@/lib/srs/pacing";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";
import type { PersonalView } from "./use-personal-data";

type Update = { version: number; name: string; items: ListItem[] };

const warnClass =
  "flex gap-2 rounded-lg bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100";

/** Ngày mục tiêu (sheet): đặt, đổi hoặc bỏ; xem trước số từ mới/ngày. */
function TargetDateSheet({
  notebook,
  owner,
  today,
  remaining,
  onClose,
}: {
  notebook: NotebookRow;
  owner: string;
  today: string;
  remaining: number;
  onClose: () => void;
}) {
  const t = useTranslations("library");
  const locale = useLocale();
  const min = minTargetDate(today);
  const [date, setDate] = useState(() =>
    notebook.target_date && notebook.target_date >= min
      ? notebook.target_date
      : defaultTargetDate(today, null),
  );
  const [saving, setSaving] = useState(false);
  const tooClose = date < min;
  const plan = tooClose ? null : previewPlan(remaining, date, today);

  async function save(next: string | null) {
    setSaving(true);
    const db = getLocalDb();
    await setTargetDate(db, owner, notebook.id, next);
    await openNewWords(db, owner);
    showToast({ text: t(next ? "plan.saved" : "plan.removed") });
    onClose();
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t("plan.sheetTitle")}>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">{t("add.targetDate")}</span>
        <input
          type="date"
          value={date}
          min={min}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-invalid={tooClose}
          className="h-11 rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive"
        />
      </label>
      {tooClose && (
        <p className="text-sm text-destructive" role="alert">
          {t("add.tooClose", { date: formatDay(min, locale) })}
        </p>
      )}
      {plan && (
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-3 text-sm" aria-live="polite">
          <p className="font-medium">
            {plan.perDay > 0 ? t("add.plan", { perDay: plan.perDay }) : t("add.planNone")}
          </p>
          <p className="text-muted-foreground">
            {t("add.planFinal", { date: formatDay(plan.finalFrom, locale) })}
          </p>
        </div>
      )}
      {plan?.overload && (
        <p className={warnClass} role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("add.overload", { perDay: plan.perDay })}
        </p>
      )}
      <Button className="min-h-11" disabled={saving || tooClose} onClick={() => void save(date)}>
        {t("plan.save")}
      </Button>
      {notebook.target_date && (
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={saving}
          onClick={() => void save(null)}
        >
          {t("plan.remove")}
        </Button>
      )}
    </Sheet>
  );
}

/** "Danh sách có thêm N từ": tìm khi có mạng, sổ theo danh sách đã nhận bản cũ hơn. */
function useListUpdate(notebook: NotebookRow, owner: string, online: boolean) {
  const [update, setUpdate] = useState<Update | null>(null);
  const listId = notebook.source_list_id;
  const received = notebook.source_list_version ?? null;

  useEffect(() => {
    if (!listId || received === null || !online) return;
    let cancelled = false;
    void (async () => {
      const list = await fetchLibraryList(listId);
      if (!list || list.version <= received) return;
      const [releases, words] = await Promise.all([
        fetchReleases(listId),
        fetchListWords(listId, list.version),
      ]);
      const db = getLocalDb();
      const entries = await db.notebook_entries.where("notebook_id").equals(notebook.id).toArray();
      const userWords = await db.user_words.bulkGet(
        entries.filter((e) => !e.deleted_at).map((e) => e.user_word_id),
      );
      const pending = new Set(
        pendingListWords({
          releases,
          receivedVersion: received,
          latestSenseIds: words.map((w) => w.senseId),
          notebookSenseIds: new Set(
            userWords.filter((u) => u && !u.deleted_at).map((u) => u!.sense_id),
          ),
        }),
      );
      if (cancelled) return;
      // Bản mới chỉ bỏ bớt từ: từ bị bỏ vẫn ở lại sổ, chỉ ghi đã nhận.
      if (pending.size === 0) {
        await skipListUpdate(db, owner, notebook.id, list.version);
        return;
      }
      setUpdate({
        version: list.version,
        name: list.title,
        items: words.filter((w) => pending.has(w.senseId)),
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [listId, received, online, notebook.id, owner]);

  return [update, setUpdate] as const;
}

/**
 * Lộ trình của sổ có ngày mục tiêu (tiến độ so với kế hoạch) và thông báo bản cập nhật của danh
 * sách Thư viện. `editing`: mở sheet ngày mục tiêu (từ menu sổ).
 */
export function NotebookPlan({
  notebook,
  data,
  owner,
  editing,
  onEditingChange,
}: {
  notebook: NotebookRow;
  data: PersonalView;
  owner: string;
  editing: boolean;
  onEditingChange: (open: boolean) => void;
}) {
  const t = useTranslations("library");
  const locale = useLocale();
  const online = useOnlineStatus();
  const timeZone = useLiveQuery(
    async () =>
      ((await getLocalDb().user_settings.get(owner)) ?? defaultSettingsRow(owner)).timezone,
    [owner],
  );
  const [update, setUpdate] = useListUpdate(notebook, owner, online);
  const [accepting, setAccepting] = useState(false);

  const progress = useMemo(
    () =>
      timeZone
        ? notebookProgress({
            notebook,
            notebooks: data.notebooks,
            entries: data.entries,
            userWords: data.userWords,
            cards: data.cards,
            now: new Date(),
            timeZone,
          })
        : null,
    [notebook, data, timeZone],
  );
  if (!timeZone) return null;
  const today = studyDay(new Date(), timeZone);
  const remaining = progress?.queued ?? countQueued(notebook.id, data);

  async function accept(next: Update) {
    setAccepting(true);
    try {
      const db = getLocalDb();
      await cacheListContent(
        db,
        next.items.map((i) => i.senseId),
      );
      const result = await acceptListUpdate(db, owner, notebook.id, next.version, next.items);
      setUpdate(null);
      showToast({
        text: t("update.accepted", { count: result.added.length + result.linked.length }),
      });
    } catch {
      showToast({ text: t("update.failed") });
    } finally {
      setAccepting(false);
    }
  }

  async function skip(next: Update) {
    await skipListUpdate(getLocalDb(), owner, notebook.id, next.version);
    setUpdate(null);
  }

  return (
    <>
      {update && (
        <section
          className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-accent/40 p-3"
          aria-label={t("update.title", { count: update.items.length })}
        >
          <h2 className="font-semibold">{t("update.title", { count: update.items.length })}</h2>
          <p className="text-sm">{t("update.body", { name: update.name })}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              disabled={accepting}
              onClick={() => void skip(update)}
            >
              {t("update.skip")}
            </Button>
            <Button
              className="min-h-11 flex-1"
              disabled={accepting || !online}
              onClick={() => void accept(update)}
            >
              {t("update.accept")}
            </Button>
          </div>
        </section>
      )}

      {notebook.source_list_id && (
        <Link
          href={`/library/${notebook.source_list_id}`}
          className="-mt-2 inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Library className="size-4" aria-hidden />
          {t("plan.source")}
        </Link>
      )}

      {progress && notebook.target_date && (
        <section
          className="flex flex-col gap-2 rounded-xl border p-3"
          aria-label={t("plan.title")}
          data-testid="notebook-plan"
        >
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="flex-1 text-sm font-medium">
              {t("plan.target", {
                date: formatDay(notebook.target_date, locale),
                count: Math.max(0, progress.daysLeft),
              })}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{t("plan.progress", { studied: progress.studied, total: progress.total })}</span>
            {progress.phase !== "passed" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  progress.behind > 0
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                    : "bg-accent text-accent-foreground",
                )}
              >
                {progress.behind > 0
                  ? t("plan.behind", { count: progress.behind })
                  : t("plan.onTrack")}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={t("plan.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.studied}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${progress.total ? (progress.studied / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          {progress.phase === "learning" && (
            <p className="text-sm text-muted-foreground">
              {progress.quota > 0
                ? t("plan.today", { count: progress.quota })
                : t("plan.todayNone")}
            </p>
          )}
          {progress.behind > 0 && progress.phase !== "passed" && (
            <p className="text-sm text-muted-foreground">
              {t("plan.behindHint", { count: progress.behind })}
            </p>
          )}
          {progress.phase === "final" && (
            <>
              <p className="text-sm text-muted-foreground">{t("plan.final")}</p>
              {progress.queued > 0 && (
                <p className={warnClass}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("plan.finalLeft", { count: progress.queued })}
                </p>
              )}
            </>
          )}
          {progress.phase === "passed" && (
            <p className="text-sm text-muted-foreground">{t("plan.passed")}</p>
          )}
          {progress.overload && progress.phase === "learning" && (
            <p className={warnClass} role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("plan.overload", { count: progress.quota })}
            </p>
          )}
          <Button variant="outline" className="min-h-11" onClick={() => onEditingChange(true)}>
            {t(progress.phase === "passed" ? "plan.setNew" : "plan.change")}
          </Button>
        </section>
      )}

      {editing && (
        <TargetDateSheet
          notebook={notebook}
          owner={owner}
          today={today}
          remaining={remaining}
          onClose={() => onEditingChange(false)}
        />
      )}
    </>
  );
}

function countQueued(notebookId: string, data: PersonalView): number {
  const ids = new Set(
    data.entries
      .filter((e) => !e.deleted_at && e.notebook_id === notebookId)
      .map((e) => e.user_word_id),
  );
  return data.userWords.filter((u) => !u.deleted_at && u.status === "queued" && ids.has(u.id))
    .length;
}
