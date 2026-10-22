"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Rating, type Grade } from "ts-fsrs";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Intervals, ModeProps } from "./types";
import { WordBack, WordHead } from "./word-face";

const GRADES: { rating: Grade; key: "again" | "hard" | "good" | "easy"; tone: string }[] = [
  { rating: Rating.Again, key: "again", tone: "border-red-300 text-red-700 dark:text-red-300" },
  { rating: Rating.Hard, key: "hard", tone: "border-amber-300 text-amber-800 dark:text-amber-200" },
  { rating: Rating.Good, key: "good", tone: "border-green-300 text-green-800 dark:text-green-200" },
  { rating: Rating.Easy, key: "easy", tone: "border-sky-300 text-sky-800 dark:text-sky-200" },
];

/** Vuốt ngang xa hơn mức này (px) sau khi lật: trái = Quên, phải = Được. */
const SWIPE_PX = 80;

/**
 * Flashcard: mặt trước là từ (tự phát âm) hoặc nghĩa (chiều ngược); chạm/Space để lật; 4 nút tự
 * chấm kèm khoảng cách tới lần ôn sau; phím 1–4; vuốt trái/phải trên điện thoại.
 */
export function Flashcard({
  item,
  voice,
  muted,
  onAnswer,
  reverse = false,
  intervals,
}: ModeProps & { reverse?: boolean; intervals: Intervals }) {
  const t = useTranslations("review");
  const [flipped, setFlipped] = useState(false);
  const [shownAt] = useState(() => Date.now());
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);

  function answer(rating: Grade) {
    onAnswer({
      selfRating: rating,
      correct: rating !== Rating.Again,
      responseMs: Date.now() - shownAt,
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.repeat) return;
      if (!flipped && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setFlipped(true);
      } else if (flipped && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        answer(Number(event.key) as Grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(event: PointerEvent) {
    start.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent) {
    if (!start.current || !flipped) return;
    const x = event.clientX - start.current.x;
    if (Math.abs(x) > Math.abs(event.clientY - start.current.y)) setDx(x);
  }
  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    if (!flipped) return;
    if (dx <= -SWIPE_PX) answer(Rating.Again);
    else if (dx >= SWIPE_PX) answer(Rating.Good);
    setDx(0);
  }

  const label = (rating: Grade) => {
    const interval = intervals[rating];
    return t(`interval.${interval.unit}`, { count: interval.value });
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={flipped ? t("cardBack") : t("flip")}
        onClick={() => !flipped && setFlipped(true)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
        className={cn(
          "flex min-h-72 flex-1 touch-pan-y flex-col justify-center gap-4 rounded-3xl border bg-card p-5 shadow-sm select-none focus-visible:outline-2 focus-visible:outline-ring",
          !flipped && "cursor-pointer",
          dx <= -SWIPE_PX && "border-red-400",
          dx >= SWIPE_PX && "border-green-400",
        )}
        style={{ transform: dx ? `translateX(${dx / 3}px) rotate(${dx / 40}deg)` : undefined }}
      >
        {reverse && !flipped ? (
          <p className="text-center text-2xl font-semibold">{item.meaning}</p>
        ) : (
          <WordHead item={item} voice={voice} autoPlay={!muted && (!reverse || flipped)} />
        )}
        {flipped ? (
          <WordBack item={item} voice={voice} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {t(reverse ? "flipHintReverse" : "flipHint")}
          </p>
        )}
      </div>

      {flipped ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("rateLabel")}>
          {GRADES.map(({ rating, key, tone }) => (
            <button
              key={rating}
              type="button"
              onClick={() => answer(rating)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-xl border-2 bg-background px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring",
                tone,
              )}
            >
              {t(`rating.${key}`)}
              <span className="text-xs font-normal text-muted-foreground">{label(rating)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="min-h-12 rounded-xl bg-primary font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("show")}
        </button>
      )}
    </div>
  );
}
