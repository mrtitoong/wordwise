"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Sparkles, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GUEST_OWNER } from "@/lib/db/ids";
import { weightsOf } from "@/lib/db/repo";
import type { SessionSummary } from "@/lib/review/session";
import { computeStreak } from "@/lib/review/streak";
import { planToday } from "@/lib/review/today";
import { createScheduler } from "@/lib/srs/scheduler";
import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/local";
import { finishedSessions } from "@/lib/db/review-store";
import { EXTRA_NEW_WORDS } from "./today-screen";
import { toTodayInput, useReviewData } from "./use-review-data";

const DAY_MS = 86_400_000;
/** Gợi ý khách tạo tài khoản sau chừng này phiên hoặc chừng này từ (ux-flows §5). */
export const GUEST_PROMPT_SESSIONS = 3;
export const GUEST_PROMPT_WORDS = 20;
const GUEST_PROMPT_KEY = "ww_guest_prompt_dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(GUEST_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Kết quả phiên (ux-flows §3.10b). */
export function SessionResult({
  summary,
  owner,
  kind,
}: {
  summary: SessionSummary;
  owner: string;
  kind: "full" | "short" | "single" | "retry";
}) {
  const t = useTranslations("review.result");
  const router = useRouter();
  const data = useReviewData(owner);
  const sessions = useLiveQuery(() => finishedSessions(getLocalDb(), owner), [owner]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now] = useState(() => new Date());

  const view = useMemo(() => {
    if (!data) return null;
    const scheduler = createScheduler({
      desiredRetention: data.settings.desired_retention,
      weights: weightsOf(data.settings),
    });
    const tomorrow = planToday(toTodayInput(data), scheduler, new Date(now.getTime() + DAY_MS));
    const streak = computeStreak({
      answers: data.logs.map((l) => l.reviewed_at),
      completedDays: data.completedDays,
      now,
      timeZone: data.settings.timezone,
    });
    const live = data.userWords.filter((u) => !u.deleted_at);
    return {
      streak,
      tomorrow,
      queued: live.filter((u) => u.status === "queued").length,
      words: live.length,
    };
  }, [data, now]);

  const missedIds = summary.missed.map((m) => m.cardId);

  const showGuestPrompt =
    owner === GUEST_OWNER &&
    !dismissed &&
    view &&
    ((sessions ?? 0) >= GUEST_PROMPT_SESSIONS || view.words >= GUEST_PROMPT_WORDS);

  const minutes = Math.max(1, Math.round(summary.durationMs / 60_000));

  return (
    <div className="flex min-h-dvh flex-col gap-5 py-8">
      {view && (
        <section className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950">
            <Flame className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">{t("streak", { count: view.streak.current })}</h1>
        </section>
      )}

      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-4 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">{t("answers")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{summary.answers}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("accuracy")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{Math.round(summary.accuracy * 100)}%</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("time")}</dt>
          <dd className="text-2xl font-bold tabular-nums">{t("minutes", { count: minutes })}</dd>
        </div>
      </dl>

      {summary.levelUps > 0 && (
        <p className="text-center text-sm">{t("levelUps", { count: summary.levelUps })}</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("missedTitle")}</h2>
        {summary.missed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMistakes")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label={t("missedTitle")}>
            {summary.missed.map((m) => (
              <li key={m.wordId}>
                <Link
                  href={`/words/${m.wordId}`}
                  lang="en"
                  className="flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {m.lemma}
                  {m.times > 1 && <span className="text-xs text-muted-foreground">×{m.times}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view && (
        <p className="text-sm text-muted-foreground">
          {view.tomorrow.reviews > 0
            ? t("tomorrow", { count: view.tomorrow.reviews, minutes: view.tomorrow.minutes })
            : t("tomorrowNone")}
        </p>
      )}

      {showGuestPrompt && (
        <section className="flex flex-col gap-3 rounded-2xl border-2 border-primary/40 p-4">
          <p className="flex items-start gap-2 text-sm">
            <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            {t("guestPrompt")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setDismissed(true);
                try {
                  localStorage.setItem(GUEST_PROMPT_KEY, "1");
                } catch {
                  // Không nhớ được: lần sau hỏi lại.
                }
              }}
            >
              {t("later")}
            </Button>
            <Button asChild className="min-h-11">
              <Link href="/login">{t("signUp")}</Link>
            </Button>
          </div>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button className="min-h-12 text-base" onClick={() => router.push("/")}>
          {t("done")}
        </Button>
        {missedIds.length > 0 && kind !== "retry" && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => router.push(`/review/session?retry=${missedIds.join(",")}`)}
          >
            {t("retry")}
          </Button>
        )}
        {view && view.queued > 0 && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => router.push(`/review/session?more=${EXTRA_NEW_WORDS}`)}
          >
            <Sparkles aria-hidden />
            {t("moreWords", { count: Math.min(EXTRA_NEW_WORDS, view.queued) })}
          </Button>
        )}
      </div>
    </div>
  );
}
