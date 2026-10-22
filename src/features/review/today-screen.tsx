"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Play, Sparkles, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { localDay } from "@/lib/notebooks/introductions";
import { canResume } from "@/lib/review/session";
import { computeStreak } from "@/lib/review/streak";
import { planToday } from "@/lib/review/today";
import { createScheduler } from "@/lib/srs/scheduler";
import { useOwner } from "@/lib/sync/owner";
import { weightsOf } from "@/lib/db/repo";
import { toTodayInput, useReviewData } from "./use-review-data";

const DAY_MS = 86_400_000;
/** "Học thêm 5 từ mới". */
export const EXTRA_NEW_WORDS = 5;

/** Màn Hôm nay: trả lời "hôm nay tôi cần làm gì" (ux-flows §3.2). */
export function TodayScreen() {
  const t = useTranslations("today");
  const router = useRouter();
  const owner = useOwner();
  const data = useReviewData(owner);
  // Giờ hiện tại chốt khi mở màn (tránh tính lại theo từng lần render).
  const [now] = useState(() => new Date());

  const view = useMemo(() => {
    if (!data) return null;
    const scheduler = createScheduler({
      desiredRetention: data.settings.desired_retention,
      weights: weightsOf(data.settings),
    });
    const input = toTodayInput(data);
    const plan = planToday(input, scheduler, now);
    const tomorrow = planToday(input, scheduler, new Date(now.getTime() + DAY_MS));
    const streak = computeStreak({
      answers: data.logs.map((l) => l.reviewed_at),
      completedDays: data.completedDays,
      now,
      timeZone: data.settings.timezone,
    });
    const live = data.userWords.filter((uw) => !uw.deleted_at);
    const recent = data.entries
      .filter((e) => !e.deleted_at)
      .sort((a, b) => b.added_at.localeCompare(a.added_at))
      .flatMap((e) => {
        const uw = live.find((u) => u.id === e.user_word_id);
        const info = uw && data.senses.get(uw.sense_id);
        return info ? [{ wordId: info.word.id, lemma: info.word.lemma }] : [];
      })
      .filter((w, i, all) => all.findIndex((x) => x.wordId === w.wordId) === i)
      .slice(0, 3);
    const day = localDay(now, data.settings.timezone);
    return {
      plan,
      tomorrowReviews: tomorrow.reviews,
      streak,
      words: live.length,
      queued: live.filter((uw) => uw.status === "queued").length,
      recent,
      resume: canResume(data.saved, data.owner, day) ? data.saved : null,
    };
  }, [data, now]);

  if (!view) return <div className="h-48 animate-pulse rounded-2xl bg-muted" aria-hidden />;

  if (view.words === 0) {
    return (
      <EmptyState title={t("emptyTitle")} body={t("emptyBody")}>
        <Button asChild size="lg">
          <Link href="/add">{t("addFirst")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/notebooks">{t("browseLibrary")}</Link>
        </Button>
      </EmptyState>
    );
  }

  const { plan, streak } = view;
  const done = plan.items.length === 0;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <section className="flex items-center gap-3" aria-label={t("streakLabel")}>
        <span
          className={`flex size-12 items-center justify-center rounded-full ${streak.today ? "bg-orange-100 text-orange-600 dark:bg-orange-950" : "bg-muted text-muted-foreground"}`}
        >
          <Flame className="size-6" aria-hidden />
        </span>
        <p className="text-sm">
          <span className="text-lg font-semibold">
            {t("streakDays", { count: streak.current })}
          </span>
          <br />
          <span className="text-muted-foreground">
            {streak.restLeftThisWeek ? t("restLeft") : t("restUsed")}
            {streak.best > streak.current && ` · ${t("best", { count: streak.best })}`}
          </span>
        </p>
      </section>

      {plan.gentle && !done && (
        <p className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
          <b className="block">{t("gentleTitle")}</b>
          {t("gentleBody", { count: plan.items.length })}
        </p>
      )}

      {view.resume && (
        <section className="flex items-center gap-3 rounded-2xl border p-4">
          <p className="flex-1 text-sm">
            <b className="block">{t("resumeTitle")}</b>
            {t("resumeBody", {
              left: view.resume.queue.length - view.resume.position,
              total: view.resume.queue.length,
            })}
          </p>
          <Button className="min-h-11" onClick={() => router.push("/review/session?resume=1")}>
            {t("resume")}
          </Button>
        </section>
      )}

      {done ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-5">
          <h2 className="text-xl font-semibold">{t("doneTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {view.tomorrowReviews > 0
              ? t("doneBody", { count: view.tomorrowReviews })
              : t("doneBodyNone")}
          </p>
          {view.queued > 0 && (
            <Button
              className="min-h-11"
              onClick={() => router.push(`/review/session?more=${EXTRA_NEW_WORDS}`)}
            >
              <Sparkles aria-hidden />
              {t("moreWords", { count: Math.min(EXTRA_NEW_WORDS, view.queued) })}
            </Button>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
          <h2 className="text-lg font-semibold">{t("reviewTitle")}</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs opacity-80">{t("cards")}</dt>
              <dd className="text-2xl font-bold tabular-nums">{plan.reviews}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">{t("newWords")}</dt>
              <dd className="text-2xl font-bold tabular-nums">{plan.news}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">{t("minutes")}</dt>
              <dd className="text-2xl font-bold tabular-nums">~{plan.minutes}</dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            size="lg"
            className="min-h-12 text-base font-semibold"
            onClick={() => router.push("/review/session")}
          >
            <Play aria-hidden />
            {t("start")}
          </Button>
          {plan.minutes > 5 && (
            <Button
              variant="ghost"
              className="min-h-11 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => router.push("/review/session?short=1")}
            >
              <Timer aria-hidden />
              {t("short")}
            </Button>
          )}
        </section>
      )}

      {view.queued > 0 && (
        <Link
          href="/notebooks"
          className="flex min-h-11 items-center justify-between rounded-2xl border px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("queued", { count: view.queued })}
          <span className="text-primary">{t("see")}</span>
        </Link>
      )}

      {view.recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("recent")}</h2>
          <ul className="flex flex-wrap gap-2">
            {view.recent.map((w) => (
              <li key={w.wordId}>
                <Link
                  href={`/words/${w.wordId}`}
                  lang="en"
                  className="flex min-h-11 items-center rounded-full border px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {w.lemma}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
