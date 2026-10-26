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
import {
  MIN_PLACEMENT_WORDS,
  PLACEMENT_SAMPLE,
  inferKnown,
  planPlacement,
  proposedKnown,
  type PlacementAnswer,
  type PlacementPlan,
  type PlacementResult,
} from "@/lib/library/placement";
import { nameConflict } from "@/lib/notebooks/notebooks";
import { studyDay } from "@/lib/review/day";
import { defaultTargetDate, minTargetDate, previewPlan } from "@/lib/srs/pacing";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";
import { cacheListContent, type ListWord } from "./library-data";
import { PlacementQuiz } from "./placement-quiz";
import { PlacementReview } from "./placement-result";
import { formatDay } from "./shared";

type Step = "notebook" | "plan" | "placement" | "result" | "saving" | "done";
type Summary = {
  notebook: NotebookRow;
  added: number;
  linked: number;
  skipped: number;
  known: number;
  today: number;
  queued: number;
};

const NEW = "new";

/**
 * Bảng thêm danh sách vào sổ: chọn sổ → ngày mục tiêu + lộ trình → (tùy chọn) kiểm tra đầu vào →
 * tải nội dung → tóm tắt.
 */
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
  const tp = useTranslations("library.placement");
  const locale = useLocale();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>("notebook");
  const [notebookId, setNotebookId] = useState<string>(NEW);
  const [usePlan, setUsePlan] = useState(true);
  const [targetDate, setTargetDate] = useState(() => defaultTargetDate(today, list.suggested_days));
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [placement, setPlacement] = useState<PlacementPlan | null>(null);
  const [outcome, setOutcome] = useState<PlacementResult | null>(null);
  const [known, setKnown] = useState<Set<string>>(() => new Set());
  const [reviewing, setReviewing] = useState(false);
  const accent = useLiveQuery(
    async () => (await getLocalDb().user_settings.get(owner))?.accent,
    [owner],
  );

  useEffect(() => {
    void loadWords().catch(() => {});
  }, [loadWords]);

  const chosen = useMemo(
    () => (words ? words.filter((w) => !selected || selected.has(w.senseId)) : null),
    [words, selected],
  );
  // Từ đã mở để học ở sổ khác thì không tính vào lộ trình và không đưa vào kiểm tra đầu vào.
  const opened = useLiveQuery(async () => {
    if (!chosen) return new Set<string>();
    const rows = await getLocalDb().user_words.bulkGet(
      chosen.map((w) => userWordId(owner, w.senseId)),
    );
    return new Set(
      rows.flatMap((r) => (r && !r.deleted_at && r.introduced_at ? [r.sense_id] : [])),
    );
  }, [chosen, owner]);
  const eligible = useMemo(
    () => (chosen && opened ? chosen.filter((w) => !opened.has(w.senseId)) : null),
    [chosen, opened],
  );
  const count = chosen?.length ?? selected?.size ?? list.word_count;
  const remaining = Math.max(0, count - (opened?.size ?? 0) - known.size);
  const byId = useMemo(() => new Map((words ?? []).map((w) => [w.senseId, w])), [words]);

  function startPlacement() {
    if (!eligible) return;
    setPlacement(planPlacement(eligible));
    setOutcome(null);
    setKnown(new Set());
    setReviewing(false);
    setStep("placement");
  }

  function finishPlacement(answers: Map<string, PlacementAnswer>) {
    const inferred = inferKnown(placement!, answers);
    setOutcome(inferred);
    setKnown(new Set(proposedKnown(inferred)));
    setStep("result");
  }

  const choices = targetNotebooks(notebooks, defaultNotebookId(owner));
  const min = minTargetDate(today);
  const tooClose = usePlan && targetDate < min;
  const plan = usePlan && !tooClose ? previewPlan(remaining, targetDate, today) : null;
  const canPlace = !!eligible && eligible.length >= MIN_PLACEMENT_WORDS;
  const saving = step === "saving";

  async function submit() {
    setStep("saving");
    setFailed(false);
    setProgress(0);
    try {
      const all = await loadWords();
      const items = all
        .filter((w) => !selected || selected.has(w.senseId))
        .map((w) => (known.has(w.senseId) ? { ...w, known: true } : w));
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
        known: result.known?.length ?? 0,
        today: fresh.filter(
          (r) => r!.introduced_at && studyDay(new Date(r!.introduced_at), zone) === today,
        ).length,
        queued: fresh.filter((r) => r!.status === "queued").length,
      });
      setStep("done");
    } catch {
      setFailed(true);
      setStep(outcome ? "result" : "plan");
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
      onOpenChange={(o) => !o && !saving && onClose()}
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

      {(step === "plan" || (saving && !outcome)) && (
        <>
          <p className="text-sm font-medium text-muted-foreground">{t("stepPlan")}</p>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t("targetDate")}</span>
            <input
              type="date"
              value={targetDate}
              min={min}
              disabled={!usePlan || saving}
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
              disabled={saving}
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

          {canPlace && !saving && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/40 p-3">
              <p className="font-medium">{tp("offerTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {tp("offerBody", { count: Math.min(eligible?.length ?? 0, PLACEMENT_SAMPLE) })}
              </p>
              <Button className="min-h-11" disabled={tooClose} onClick={startPlacement}>
                {tp("start")}
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={() => setStep("notebook")}
            >
              {t("back")}
            </Button>
            <Button
              variant={canPlace && !saving ? "outline" : "default"}
              className="min-h-11 flex-1"
              disabled={saving || tooClose || !online}
              onClick={() => void submit()}
            >
              {saving
                ? t("saving", { percent: Math.round(progress * 100) })
                : canPlace
                  ? tp("skip", { count })
                  : t("submit", { count })}
            </Button>
          </div>
        </>
      )}

      {step === "placement" && placement && words && (
        <>
          <p className="text-sm font-medium text-muted-foreground">{tp("title")}</p>
          <PlacementQuiz
            sample={placement.sample.flatMap((id) => byId.get(id) ?? [])}
            pool={words}
            voice={accent === "uk" ? "uk" : "us"}
            onFinish={finishPlacement}
            onCancel={() => setStep("plan")}
          />
        </>
      )}

      {(step === "result" || (saving && outcome)) && outcome && (
        <>
          <p className="text-sm font-medium text-muted-foreground">{tp("resultTitle")}</p>
          <div className="flex flex-col gap-1 rounded-xl bg-muted p-3 text-sm" aria-live="polite">
            <p className="text-base font-semibold">
              {tp("estimate", { percent: outcome.estimate })}
            </p>
            <p>{tp("counts", { known: known.size, learn: remaining })}</p>
            {plan && (
              <p className="text-muted-foreground">
                {plan.perDay > 0 ? t("plan", { perDay: plan.perDay }) : t("planNone")}
              </p>
            )}
          </div>
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
          {outcome.groups.length > 0 && (
            <Button
              variant="outline"
              className="min-h-11"
              aria-expanded={reviewing}
              disabled={saving}
              onClick={() => setReviewing(!reviewing)}
            >
              {reviewing
                ? tp("hideReview")
                : tp("review", { count: proposedKnown(outcome).length })}
            </Button>
          )}
          {reviewing && (
            <PlacementReview
              groups={outcome.groups}
              words={byId}
              selected={known}
              onChange={setKnown}
            />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={startPlacement}
            >
              {tp("redo")}
            </Button>
            <Button
              className="min-h-11 flex-1"
              disabled={saving || !online}
              onClick={() => void submit()}
            >
              {saving ? t("saving", { percent: Math.round(progress * 100) }) : tp("save")}
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
              {summary.known > 0 && (
                <p className="text-muted-foreground">{tp("doneKnown", { count: summary.known })}</p>
              )}
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
