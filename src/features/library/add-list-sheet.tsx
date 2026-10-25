"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { defaultNotebookId, userWordId } from "@/lib/db/ids";
import { addListToNotebook, type ListTarget } from "@/lib/db/library-repo";
import { getLocalDb } from "@/lib/db/local";
import type { NotebookRow } from "@/lib/db/types";
import { targetNotebooks, type LibraryList } from "@/lib/library/library";
import { nameConflict } from "@/lib/notebooks/notebooks";
import { studyDay } from "@/lib/review/day";
import { defaultTargetDate, minTargetDate, previewPlan } from "@/lib/srs/pacing";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";
import { cacheListContent, type ListWord } from "./library-data";
import { formatDay } from "./shared";

type Step = "notebook" | "plan" | "saving" | "done";
type Summary = {
  notebook: NotebookRow;
  added: number;
  linked: number;
  skipped: number;
  today: number;
  queued: number;
};

const NEW = "new";

/** Bảng thêm danh sách vào sổ: chọn sổ → ngày mục tiêu + lộ trình → tải nội dung → tóm tắt. */
export function AddListSheet({
  list,
  owner,
  notebooks,
  today,
  words,
  selected,
  loadWords,
  onClose,
}: {
  list: LibraryList;
  owner: string;
  notebooks: NotebookRow[];
  today: string;
  /** Từ của danh sách (null: đang tải). */
  words: ListWord[] | null;
  selected: ReadonlySet<string> | null;
  loadWords: () => Promise<ListWord[]>;
  onClose: () => void;
}) {
  const t = useTranslations("library.add");
  const locale = useLocale();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>("notebook");
  const [notebookId, setNotebookId] = useState<string>(NEW);
  const [usePlan, setUsePlan] = useState(true);
  const [targetDate, setTargetDate] = useState(() => defaultTargetDate(today, list.suggested_days));
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void loadWords().catch(() => {});
  }, [loadWords]);

  const chosen = useMemo(
    () => (words ? words.filter((w) => !selected || selected.has(w.senseId)) : null),
    [words, selected],
  );
  // Từ đã mở để học ở sổ khác thì không tính vào lộ trình.
  const alreadyOpened = useLiveQuery(async () => {
    if (!chosen) return 0;
    const rows = await getLocalDb().user_words.bulkGet(
      chosen.map((w) => userWordId(owner, w.senseId)),
    );
    return rows.filter((r) => r && !r.deleted_at && r.introduced_at).length;
  }, [chosen, owner]);
  const count = chosen?.length ?? selected?.size ?? list.word_count;
  const remaining = Math.max(0, count - (alreadyOpened ?? 0));

  const choices = targetNotebooks(notebooks, defaultNotebookId(owner));
  const min = minTargetDate(today);
  const tooClose = usePlan && targetDate < min;
  const plan = usePlan && !tooClose ? previewPlan(remaining, targetDate, today) : null;

  async function submit() {
    setStep("saving");
    setFailed(false);
    setProgress(0);
    try {
      const all = await loadWords();
      const items = all.filter((w) => !selected || selected.has(w.senseId));
      const db = getLocalDb();
      await cacheListContent(
        db,
        items.map((w) => w.senseId),
        setProgress,
      );
      const name = nameConflict(list.title, notebooks)?.suggestion ?? list.title;
      const target: ListTarget =
        notebookId === NEW
          ? {
              kind: "new",
              name,
              coverUrl:
                list.cover_url?.startsWith("https://") && list.cover_url.length <= 300
                  ? list.cover_url
                  : null,
            }
          : { kind: "existing", notebookId };
      const { notebook, result } = await addListToNotebook(db, owner, {
        listId: list.id,
        version: list.version,
        target,
        targetDate: usePlan ? targetDate : null,
        items,
      });
      const settings = await db.user_settings.get(owner);
      const zone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
      const rows = await db.user_words.bulkGet(items.map((w) => userWordId(owner, w.senseId)));
      const fresh = rows.filter((r) => r && result.added.includes(r.sense_id));
      setSummary({
        notebook,
        added: result.added.length,
        linked: result.linked.length,
        skipped: result.skipped.length,
        today: fresh.filter(
          (r) => r!.introduced_at && studyDay(new Date(r!.introduced_at), zone) === today,
        ).length,
        queued: fresh.filter((r) => r!.status === "queued").length,
      });
      setStep("done");
    } catch {
      setFailed(true);
      setStep("plan");
    }
  }

  const option = (id: string, title: string, hint?: string) => (
    <label
      key={id}
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
        notebookId === id && "border-primary bg-accent/50",
      )}
    >
      <input
        type="radio"
        name="notebook"
        checked={notebookId === id}
        onChange={() => setNotebookId(id)}
        className="size-5 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{title}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && step !== "saving" && onClose()}
      title={
        step === "done" && summary ? t("doneTitle", { name: summary.notebook.name }) : t("title")
      }
    >
      {step === "notebook" && (
        <>
          <p className="text-sm font-medium text-muted-foreground">{t("stepNotebook")}</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{t("stepNotebook")}</legend>
            {option(NEW, t("newNotebook", { name: list.title }), t("newNotebookHint"))}
            {choices.map((n) => option(n.id, n.name))}
          </fieldset>
          {notebookId !== NEW && (
            <p className="text-sm text-muted-foreground">{t("existingHint")}</p>
          )}
          <Button className="min-h-11" onClick={() => setStep("plan")}>
            {t("next")}
          </Button>
        </>
      )}

      {(step === "plan" || step === "saving") && (
        <>
          <p className="text-sm font-medium text-muted-foreground">{t("stepPlan")}</p>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("targetDate")}</span>
            <input
              type="date"
              value={targetDate}
              min={min}
              disabled={!usePlan || step === "saving"}
              onChange={(e) => e.target.value && setTargetDate(e.target.value)}
              aria-invalid={tooClose}
              className="h-11 rounded-lg border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-destructive"
            />
            <span className="text-xs text-muted-foreground">{t("targetHint")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!usePlan}
              disabled={step === "saving"}
              onChange={(e) => setUsePlan(!e.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            {t("noTarget")}
          </label>

          {tooClose && (
            <p className="text-sm text-destructive" role="alert">
              {t("tooClose", { date: formatDay(min, locale) })}
            </p>
          )}
          {plan && (
            <div className="flex flex-col gap-1 rounded-xl bg-muted p-3 text-sm" aria-live="polite">
              <p className="font-medium">
                {plan.perDay > 0 ? t("plan", { perDay: plan.perDay }) : t("planNone")}
              </p>
              <p className="text-muted-foreground">
                {t("planFinal", { date: formatDay(plan.finalFrom, locale) })}
              </p>
            </div>
          )}
          {plan?.overload && (
            <p
              className="flex gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
              role="status"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("overload", { perDay: plan.perDay })}
            </p>
          )}
          {failed && (
            <p className="text-sm text-destructive" role="alert">
              {t("failed")}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={step === "saving"}
              onClick={() => setStep("notebook")}
            >
              {t("back")}
            </Button>
            <Button
              className="min-h-11 flex-1"
              disabled={step === "saving" || tooClose || !online}
              onClick={() => void submit()}
            >
              {step === "saving"
                ? t("saving", { percent: Math.round(progress * 100) })
                : t("submit", { count })}
            </Button>
          </div>
        </>
      )}

      {step === "done" && summary && (
        <>
          <div className="flex gap-3 rounded-xl bg-accent/50 p-3" role="status">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div className="flex flex-col gap-1 text-sm">
              <p>
                {t("doneBody", {
                  added: summary.added,
                  today: summary.today,
                  queued: summary.queued,
                })}
              </p>
              {summary.linked > 0 && (
                <p className="text-muted-foreground">
                  {t("doneLinked", { count: summary.linked })}
                </p>
              )}
              {summary.skipped > 0 && (
                <p className="text-muted-foreground">
                  {t("doneSkipped", { count: summary.skipped })}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="min-h-11 flex-1">
              <Link href={`/notebooks/${summary.notebook.id}`}>{t("openNotebook")}</Link>
            </Button>
            <Button asChild className="min-h-11 flex-1">
              <Link href="/review/session">{t("studyNow")}</Link>
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
