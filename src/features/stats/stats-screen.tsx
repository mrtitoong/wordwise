"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { weightsOf } from "@/lib/db/repo";
import { GUEST_OWNER } from "@/lib/db/ids";
import { createScheduler } from "@/lib/srs/scheduler";
import {
  computeStats,
  RETENTION_MIN_DAYS,
  SKILL_GROUPS,
  statusHistory,
  type DayValue,
  type StatusWeek,
} from "@/lib/stats/stats";
import { forgottenList, sumDays } from "@/lib/stats/view";
import { useOwner } from "@/lib/sync/owner";
import { useReviewData } from "@/features/review/use-review-data";
import { Heatmap } from "./heatmap";

const chartBox = <div className="h-[268px] animate-pulse rounded-xl bg-muted" aria-hidden />;
const StatusChart = dynamic(() => import("./charts").then((m) => m.StatusChart), {
  ssr: false,
  loading: () => chartBox,
});
const ForecastChart = dynamic(() => import("./charts").then((m) => m.ForecastChart), {
  ssr: false,
  loading: () => chartBox,
});

/** Hình minh họa mờ khi chưa có dữ liệu (cố định, không ngẫu nhiên). */
const SAMPLE_DAYS: DayValue[] = Array.from({ length: 140 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString().slice(0, 10),
  value: [0, 3, 8, 20, 40, 12, 0, 5][(i * 7 + (i % 5)) % 8]!,
}));

/** Trang Thống kê (Prompt 6.2, ux-flows §3.11): tính từ dữ liệu trong máy nên mở được khi offline. */
export function StatsScreen() {
  const t = useTranslations("stats");
  const owner = useOwner();
  const data = useReviewData(owner);
  const [now] = useState(() => new Date());

  const view = useMemo(() => {
    if (!data) return null;
    const skills = ["meaning"];
    if (data.settings.practice_spelling ?? true) skills.push("spelling");
    if ((data.settings.practice_speaking ?? false) && data.owner !== GUEST_OWNER) {
      skills.push("speaking");
    }
    const stats = computeStats({
      userWords: data.userWords,
      cards: data.cards,
      logs: data.logs,
      completedDays: data.completedDays,
      now,
      timeZone: data.settings.timezone,
      skills,
    });
    const wordOf = new Map(data.userWords.map((uw) => [uw.id, uw]));
    const forgotten = forgottenList(stats.mostForgotten, stats.leeches).flatMap((item) => {
      const uw = wordOf.get(item.userWordId);
      const info = uw && data.senses.get(uw.sense_id);
      return info ? [{ ...item, word: info.word, sense: info.sense, status: uw.status }] : [];
    });
    // "Ôn ngay": thẻ Nghĩa của các từ đang học trong danh sách.
    const reviewIds = forgotten.flatMap((item) => {
      if (item.status !== "learning") return [];
      const card = data.cards.find(
        (c) => c.user_word_id === item.userWordId && c.skill === "meaning" && !c.deleted_at,
      );
      return card ? [card.id] : [];
    });
    return { stats, forgotten, reviewIds, hasLogs: data.logs.length > 0 };
  }, [data, now]);

  // Dựng lại lịch sử bằng FSRS tốn thời gian nhất: tính sau khi các số khác đã hiện.
  const [weeks, setWeeks] = useState<StatusWeek[] | null>(null);
  useEffect(() => {
    if (!data?.logs.length) return;
    const timer = setTimeout(() => {
      const scheduler = createScheduler({
        desiredRetention: data.settings.desired_retention,
        weights: weightsOf(data.settings),
      });
      setWeeks(statusHistory(data, scheduler, now, data.settings.timezone));
    }, 0);
    return () => clearTimeout(timer);
  }, [data, now]);

  if (!view) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={t("loading")}>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!view.hasLogs) {
    return (
      <div className="flex flex-col gap-2">
        <div className="pointer-events-none opacity-30 select-none">
          <Heatmap days={SAMPLE_DAYS} decorative />
        </div>
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")}>
          <Button asChild className="min-h-11">
            <Link href="/">{t("emptyAction")}</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const { stats } = view;
  const known = stats.statuses.known + stats.statuses.mastered;
  const retention = stats.retention30;
  const enoughData = stats.dataDays >= RETENTION_MIN_DAYS && retention.rate !== null;
  const thisWeek = Math.round(stats.recentMinutes.thisWeek);
  const delta = thisWeek - Math.round(stats.recentMinutes.lastWeek);
  const studied = stats.minutes.filter((d) => d.value > 0).length;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label={t("streak")}
          value={t("streakValue", { count: stats.streak.current })}
          hint={t("streakBest", { count: stats.streak.best })}
        />
        <Tile label={t("known")} value={String(known)} hint={t("knownHint")} />
        <Tile
          label={t("retention")}
          value={enoughData ? `${Math.round(retention.rate! * 100)}%` : "—"}
          hint={
            enoughData
              ? t("retentionHint", { recalled: retention.recalled, reviews: retention.reviews })
              : t("retentionNeedData")
          }
        />
        <Tile
          label={t("minutes")}
          value={t("minutesValue", { count: thisWeek })}
          hint={
            delta > 0
              ? t("minutesMore", { count: delta })
              : delta < 0
                ? t("minutesLess", { count: -delta })
                : t("minutesSame")
          }
        />
      </div>

      <Section
        title={t("heatmap")}
        hint={t("heatmapSummary", { days: studied, minutes: Math.round(sumDays(stats.minutes)) })}
        note={t("minutesNote")}
      >
        <Heatmap days={stats.minutes} />
      </Section>

      {weeks === null ? (
        <Section title={t("statusTitle")} hint={t("statusHint")}>
          {chartBox}
        </Section>
      ) : (
        weeks.length > 0 && (
          <Section title={t("statusTitle")} hint={t("statusHint")}>
            <StatusChart history={weeks} />
          </Section>
        )
      )}

      <Section
        title={t("forecastTitle")}
        hint={t("forecastHint", { count: sumDays(stats.forecast.slice(0, 7)) })}
      >
        <ForecastChart forecast={stats.forecast} />
      </Section>

      <Section title={t("accuracyTitle")} hint={t("accuracyHint")}>
        <ul className="flex flex-col gap-3">
          {SKILL_GROUPS.map((group) => {
            const a = stats.accuracy[group];
            const percent = a.rate === null ? null : Math.round(a.rate * 100);
            return (
              <li key={group} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                <span className="text-sm">{t(`skill.${group}`)}</span>
                <span
                  className="h-3 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={
                    percent === null
                      ? `${t(`skill.${group}`)}: ${t("accuracyNone")}`
                      : `${t(`skill.${group}`)}: ${percent}%, ${t("accuracyCount", { correct: a.correct, answers: a.answers })}`
                  }
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${percent ?? 0}%`, background: "var(--chart-bar)" }}
                  />
                </span>
                <span
                  className="min-w-10 text-right text-sm whitespace-nowrap tabular-nums"
                  aria-hidden
                >
                  {percent === null ? (
                    <span className="text-xs text-muted-foreground">{t("accuracyNone")}</span>
                  ) : (
                    `${percent}%`
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("forgottenTitle")} hint={t("forgottenHint")}>
        {view.forgotten.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("forgottenNone")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y rounded-2xl border">
              {view.forgotten.map((item) => (
                <li key={item.userWordId} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <b lang="en">{item.word.lemma}</b>
                      {item.lapses !== null && (
                        <span className="rounded-full bg-accent px-2 text-xs text-accent-foreground">
                          {t("leech")}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.sense.meaning_vi}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.recent !== null
                        ? t("forgottenCount", { count: item.recent })
                        : t("leechCount", { count: item.lapses ?? 0 })}
                    </p>
                  </div>
                  <Button asChild variant="outline" className="min-h-11 shrink-0">
                    <Link
                      href={`/words/${item.word.id}`}
                      aria-label={t("addNoteLabel", { word: item.word.lemma })}
                    >
                      {t("addNote")}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            {view.reviewIds.length > 0 && (
              <Button asChild className="min-h-12 text-base">
                <Link href={`/review/session?retry=${view.reviewIds.join(",")}`}>
                  {t("reviewNow")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="flex flex-col gap-1 rounded-2xl border p-4">
      <h2 className="text-xs text-muted-foreground">{label}</h2>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}

function Section({
  title,
  hint,
  note,
  children,
}: {
  title: string;
  hint?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </section>
  );
}
