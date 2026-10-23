"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  analysisSummary,
  ANALYSIS_STEPS,
  durationMinutes,
  isJobActive,
  JOB_COLUMNS,
  jobProgress,
  LIST_CEFR,
} from "@/lib/admin/lists";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { retryAnalysis, startAnalysis } from "./actions";

export type JobSnapshot = {
  id: string;
  status: string;
  step: string;
  done: number;
  total: number;
  errors: unknown;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  state: unknown;
};

const POLL_MS = 2000;

/** Thông báo lỗi mới nhất mà worker ghi vào import_jobs.errors. */
function lastError(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const last = errors[errors.length - 1] as { message?: unknown } | string;
  return typeof last === "string" ? last : typeof last?.message === "string" ? last.message : null;
}

/**
 * Bấm Phân tích và theo dõi 6 bước (ux-flows §3.13). Đang chạy thì hỏi lại tiến độ mỗi 2 giây
 * (chốt GĐ7: không dùng Realtime); rời trang việc vẫn chạy nền.
 */
export function AnalysisPanel({
  listId,
  listStatus,
  sourceCount,
  initialJob,
}: {
  listId: string;
  listStatus: string;
  sourceCount: number;
  initialJob: JobSnapshot | null;
}) {
  const t = useTranslations("admin.analysis");
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [minCefr, setMinCefr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"noSources" | "busy" | "failed" | null>(null);
  const active = isJobActive(job);

  useEffect(() => {
    if (!job || !isJobActive(job)) return;
    const timer = setInterval(async () => {
      const { data } = await createClient()
        .from("import_jobs")
        .select(JOB_COLUMNS)
        .eq("id", job.id)
        .maybeSingle();
      if (!data) return;
      setJob(data);
      // Xong hoặc lỗi: tải lại trang để cập nhật trạng thái danh sách và số từ.
      if (!isJobActive(data)) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, router]);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await startAnalysis(listId, minCefr || null);
    if (result.ok) {
      setJob({
        id: result.data.jobId,
        status: "queued",
        step: "extract",
        done: 0,
        total: 0,
        errors: [],
        cost_usd: 0,
        input_tokens: 0,
        output_tokens: 0,
        state: {},
      });
      router.refresh();
    } else {
      setError(
        result.error === "no_sources"
          ? "noSources"
          : result.error === "list_busy"
            ? "busy"
            : "failed",
      );
    }
    setBusy(false);
  }

  const progress = job ? jobProgress(job) : null;
  const summary = job ? analysisSummary(job.state) : null;
  const canStart = !active && (listStatus === "draft" || listStatus === "review");
  const stepName = (index: number) =>
    t(`steps.${ANALYSIS_STEPS[Math.min(index, ANALYSIS_STEPS.length - 1)]!}`);

  return (
    <section aria-labelledby="analysis-heading" className="flex flex-col gap-3">
      <h2 id="analysis-heading" className="text-lg font-semibold">
        {t("title")}
      </h2>

      {canStart && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("minCefr")}
            <select
              value={minCefr}
              onChange={(e) => setMinCefr(e.target.value)}
              className="min-h-11 rounded-lg border bg-background px-3"
            >
              <option value="">{t("all")}</option>
              {LIST_CEFR.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">{t("minCefrHint")}</span>
          </label>
          <Button className="min-h-11" disabled={busy || sourceCount === 0} onClick={start}>
            {busy ? t("starting") : t("start")}
          </Button>
          {sourceCount === 0 && <p className="text-sm text-muted-foreground">{t("noSources")}</p>}
          {listStatus === "review" && (
            <p className="w-full text-sm text-muted-foreground">{t("rerunHint")}</p>
          )}
        </div>
      )}
      {!active && listStatus === "published" && (
        <p className="rounded-xl bg-muted p-3 text-sm">{t("publishedHint")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}

      {job && progress && (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <ol className="grid grid-cols-3 gap-2 text-xs md:grid-cols-6">
            {ANALYSIS_STEPS.map((step, i) => {
              const done = i < progress.stepIndex;
              const current = i === progress.stepIndex && !progress.finished;
              return (
                <li
                  key={step}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-1",
                    done && "border-primary/40 bg-accent",
                    current && progress.failed && "border-destructive text-destructive",
                    current && !progress.failed && "border-primary font-medium",
                  )}
                >
                  {done && <Check className="size-3" aria-hidden />}
                  {i + 1}. {t(`steps.${step}`)}
                </li>
              );
            })}
          </ol>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={t("title")}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn("h-full", progress.failed ? "bg-destructive" : "bg-primary")}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p role="status" className="text-sm">
            {progress.finished
              ? t("done")
              : progress.failed
                ? t("failedAt", { step: stepName(progress.stepIndex) })
                : job.status === "queued" && job.done === 0 && progress.stepIndex === 0
                  ? t("queued")
                  : t("running", { step: stepName(progress.stepIndex) })}
            {job.total > 0 &&
              !progress.finished &&
              ` · ${t(job.step === "extract" ? "progressParts" : "progress", { done: job.done, total: job.total })}`}
          </p>
          {progress.finished && summary && <SummaryView summary={summary} />}
          {progress.failed && lastError(job.errors) && (
            <p className="rounded-lg bg-muted p-2 text-xs">{lastError(job.errors)}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("cost", {
              cost: Number(job.cost_usd).toFixed(2),
              tokens: (job.input_tokens + job.output_tokens).toLocaleString(),
            })}
            {active && ` · ${t("leave")}`}
          </p>
          {progress.failed && (
            <Button
              className="min-h-11 w-fit"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await retryAnalysis(listId, job.id);
                if (result.ok) setJob({ ...job, status: "queued" });
                setBusy(false);
              }}
            >
              {t("retry")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

const WARNING_CODES = [
  "spelling",
  "rare",
  "above_level",
  "many_senses",
  "no_context",
  "low_confidence",
] as const;
const DROP_CODES = ["below_level", "not_a_word", "content_failed", "duplicate", "invalid"] as const;

/** Kết quả khi xong: số từ, cảnh báo theo loại, từ bị bỏ và lý do, từ mới, thời gian. */
function SummaryView({ summary }: { summary: NonNullable<ReturnType<typeof analysisSummary>> }) {
  const t = useTranslations("admin.analysis.summary");
  const minutes = durationMinutes(summary.durationSeconds);
  const warnings = WARNING_CODES.filter((code) => (summary.warnings[code] ?? 0) > 0);
  const dropped = DROP_CODES.filter((code) => (summary.dropped[code] ?? 0) > 0);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {t("items", { count: summary.items })} ·{" "}
        {t("withWarnings", { count: summary.withWarnings })} ·{" "}
        {t("newWords", { count: summary.newWords })}
        {minutes !== null && ` · ${t("duration", { minutes })}`}
      </p>
      {warnings.length > 0 && (
        <ul aria-label={t("warningsTitle")} className="flex flex-wrap gap-2">
          {warnings.map((code) => (
            <li key={code} className="rounded-full border px-3 py-1 text-xs">
              {t(`warnings.${code}`)}: {summary.warnings[code]}
            </li>
          ))}
        </ul>
      )}
      {dropped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("droppedTitle")}{" "}
          {dropped.map((code) => `${t(`dropped.${code}`)} (${summary.dropped[code]})`).join(", ")}
        </p>
      )}
    </div>
  );
}
