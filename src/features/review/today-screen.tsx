"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Flame, Inbox, Repeat, Sparkles, Timer, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { studyDay } from "@/lib/review/day";
import { canResume } from "@/lib/review/session";
import { dayProgress, greetingOf, knownWords } from "@/lib/review/progress";
import { computeStreak } from "@/lib/review/streak";
import { planToday } from "@/lib/review/today";
import { createScheduler } from "@/lib/srs/scheduler";
import { useOwner } from "@/lib/sync/owner";
import { weightsOf } from "@/lib/db/repo";
import { LanguageSwitch } from "./language-switch";
import { learningScope, toTodayInput, useReviewData } from "./use-review-data";

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
    const scope = learningScope(data);
    const live = scope.userWords.filter((uw) => !uw.deleted_at);
    const recent = scope.entries
      .filter((e) => !e.deleted_at)
      .sort((a, b) => b.added_at.localeCompare(a.added_at))
      .flatMap((e) => {
        const uw = live.find((u) => u.id === e.user_word_id);
        const info = uw && data.senses.get(uw.sense_id);
        return info ? [{ wordId: info.word.id, lemma: info.word.lemma }] : [];
      })
      .filter((w, i, all) => all.findIndex((x) => x.wordId === w.wordId) === i)
      .slice(0, 3);
    const day = studyDay(now, data.settings.timezone);
    return {
      progress: dayProgress(scope.logs, plan.items.length, now, data.settings.timezone),
      greeting: greetingOf(now, data.settings.timezone),
      known: knownWords(scope.cards.filter((c) => !c.deleted_at)),
      language: scope.language,
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

  const languageSwitch = owner && <LanguageSwitch owner={owner} current={view.language} />;

  if (view.words === 0) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        {languageSwitch}
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")}>
          <Button asChild size="lg">
            <Link href="/add">{t("addFirst")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/library">{t("browseLibrary")}</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const { plan, streak, progress } = view;
  const done = plan.items.length === 0;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {languageSwitch}
      <header className="flex flex-col gap-0.5">
        <h2 className="text-2xl leading-tight font-extrabold text-balance">
          {t(`greeting.${view.greeting}`)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {done ? t("doneSub") : t("leftToday", { count: plan.items.length })}
        </p>
      </header>

      {plan.gentle && !done && (
        <p className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
          <b className="block">{t("gentleTitle")}</b>
          {t("gentleBody", { count: plan.items.length })}
        </p>
      )}

      {view.resume && (
        <section className="flex items-center gap-3 rounded-2xl bg-card p-4 lift">
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
        <section className="flex flex-col gap-4 rounded-3xl bg-card p-5 lift">
          <div className="flex items-center gap-4">
            <DayRing progress={progress} label={t("ringLabel", progress)} tone="card">
              <Trophy className="size-7 text-primary" aria-hidden />
            </DayRing>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-xl font-bold">{t("doneTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {view.tomorrowReviews > 0
                  ? t("doneBody", { count: view.tomorrowReviews })
                  : t("doneBodyNone")}
              </p>
            </div>
          </div>
          {view.queued > 0 && (
            <Button
              size="lg"
              className="min-h-12"
              onClick={() => router.push(`/review/session?more=${EXTRA_NEW_WORDS}`)}
            >
              <Sparkles aria-hidden />
              {t("moreWords", { count: Math.min(EXTRA_NEW_WORDS, view.queued) })}
            </Button>
          )}
        </section>
      ) : (
        <section
          aria-labelledby="today-review-title"
          className="relative isolate flex flex-col gap-4 overflow-hidden rounded-3xl bg-linear-150 from-hero-from to-hero-to p-5 text-white"
        >
          {/* Chấm xanh chanh của logo, chỉ trang trí. */}
          <span
            aria-hidden
            className="absolute -top-12 -right-12 -z-10 size-28 rounded-full bg-lime opacity-90"
          />
          <h2 id="today-review-title" className="sr-only">
            {t("reviewTitle")}
          </h2>
          <div className="flex items-center gap-4">
            <DayRing progress={progress} label={t("ringLabel", progress)} tone="hero">
              <span className="text-2xl leading-none font-extrabold tabular-nums">
                {progress.done}
              </span>
              <span className="text-[10px] opacity-90">
                {t("ringUnit", { total: progress.total })}
              </span>
            </DayRing>
            <ul className="flex min-w-0 flex-col gap-1 text-sm">
              <Stat icon={<Repeat className="size-4" aria-hidden />} value={plan.reviews}>
                {t("cards")}
              </Stat>
              <Stat icon={<Sparkles className="size-4" aria-hidden />} value={plan.news}>
                {t("newWords")}
              </Stat>
              <Stat icon={<Timer className="size-4" aria-hidden />} value={`~${plan.minutes}`}>
                {t("minutes")}
              </Stat>
            </ul>
          </div>
          <Button
            variant="cta"
            size="lg"
            className="min-h-13 text-base"
            onClick={() => router.push("/review/session")}
          >
            {progress.done > 0 ? t("continue") : t("start")}
            <ArrowRight aria-hidden />
          </Button>
          {plan.minutes > 5 && (
            <Button
              variant="ghost"
              className="min-h-11 text-white hover:bg-white/10 hover:text-white"
              onClick={() => router.push("/review/session?short=1")}
            >
              <Timer aria-hidden />
              {t("short")}
            </Button>
          )}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <section
          aria-label={t("streakLabel")}
          className="flex flex-col gap-1 rounded-2xl bg-card p-3 lift"
        >
          <span
            className={`flex size-9 items-center justify-center rounded-xl ${streak.today ? "bg-streak text-white" : "bg-muted text-muted-foreground"}`}
          >
            <Flame className="size-5" aria-hidden />
          </span>
          <span className="font-bold">{t("streakDays", { count: streak.current })}</span>
          <span className="text-xs text-muted-foreground">
            {streak.restLeftThisWeek ? t("restLeft") : t("restUsed")}
            {streak.best > streak.current && ` · ${t("best", { count: streak.best })}`}
          </span>
        </section>
        <Link
          href="/stats"
          aria-label={`${t("knownLabel")}: ${view.known}`}
          className="flex flex-col gap-1 rounded-2xl bg-card p-3 lift focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success-soft-foreground">
            <Trophy className="size-5" aria-hidden />
          </span>
          <span className="text-lg leading-tight font-bold tabular-nums">{view.known}</span>
          <span className="text-xs text-muted-foreground">{t("known")}</span>
        </Link>
      </div>

      {view.queued > 0 && (
        <Link
          href="/notebooks"
          className="flex min-h-11 items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm lift focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Inbox className="size-5 text-primary" aria-hidden />
          <span className="flex-1">{t("queued", { count: view.queued })}</span>
          <span className="font-semibold text-primary">{t("see")}</span>
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
                  lang={view.language}
                  className="flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold lift focus-visible:outline-2 focus-visible:outline-ring"
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

function Stat({
  icon,
  value,
  children,
}: {
  icon: ReactNode;
  value: number | string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      {icon}
      <span className="text-base font-extrabold tabular-nums">{value}</span>
      <span className="opacity-90">{children}</span>
    </li>
  );
}

const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

/** Vòng mục tiêu ngày: câu đã làm / tổng câu hôm nay. */
function DayRing({
  progress,
  label,
  tone,
  children,
}: {
  progress: { ratio: number };
  label: string;
  tone: "hero" | "card";
  children: ReactNode;
}) {
  return (
    <div role="img" aria-label={label} className="relative size-21 shrink-0">
      <svg viewBox="0 0 84 84" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="42"
          cy="42"
          r={RING_R}
          fill="none"
          strokeWidth="8"
          className={tone === "hero" ? "stroke-white/25" : "stroke-muted"}
        />
        {progress.ratio > 0 && (
          <circle
            cx="42"
            cy="42"
            r={RING_R}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress.ratio)}
            className={`transition-[stroke-dashoffset] duration-700 ${tone === "hero" ? "stroke-lime" : "stroke-primary"}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
