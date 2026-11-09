"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Rating, type Grade } from "ts-fsrs";
import { useTranslations } from "next-intl";
import { readingConcealed } from "@/lib/review/cues";
import { cn } from "@/lib/utils";
import type { Intervals, ModeProps } from "./types";
import { WordBack, WordHead } from "./word-face";

const GRADES: { rating: Grade; key: "again" | "hard" | "good" | "easy"; tone: string }[] = [
  {
    rating: Rating.Again,
    key: "again",
    tone: "bg-grade-again [--press:var(--grade-again-shadow)]",
  },
  { rating: Rating.Hard, key: "hard", tone: "bg-grade-hard [--press:var(--grade-hard-shadow)]" },
  { rating: Rating.Good, key: "good", tone: "bg-grade-good [--press:var(--grade-good-shadow)]" },
  { rating: Rating.Easy, key: "easy", tone: "bg-grade-easy [--press:var(--grade-easy-shadow)]" },
];

/** Vuốt ngang xa hơn mức này (px) sau khi lật: trái = Quên, phải = Nhớ. */
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
  paper = false,
  intervals,
}: ModeProps & { reverse?: boolean; paper?: boolean; intervals: Intervals }) {
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

  const conceal = readingConcealed(item.word.content.language, item.card, flipped);
  const label = (rating: Grade) => {
    const interval = intervals[rating];
    return t(`interval.${interval.unit}`, { count: interval.value });
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Hai lớp giấy phía sau: trông như một xấp thẻ. */}
      <div className="relative flex flex-1 flex-col pb-3">
        <span aria-hidden className="absolute inset-x-6 top-5 bottom-0 rounded-3xl bg-primary/15" />
        <span
          aria-hidden
          className="absolute inset-x-3 top-2.5 bottom-1.5 rounded-3xl bg-primary/10"
        />
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
            "relative flex min-h-72 flex-1 touch-pan-y flex-col justify-center gap-4 rounded-3xl border-2 border-transparent bg-card p-5 shadow-[0_8px_24px_rgb(80_50_200/0.12)] select-none focus-visible:outline-2 focus-visible:outline-ring",
            !flipped && "cursor-pointer",
            dx <= -SWIPE_PX && "border-grade-again",
            dx >= SWIPE_PX && "border-grade-good",
          )}
          style={{ transform: dx ? `translateX(${dx / 3}px) rotate(${dx / 40}deg)` : undefined }}
        >
          {reverse && !flipped ? (
            <p className="text-center text-2xl font-semibold">{item.meaning}</p>
          ) : (
            <WordHead
              item={item}
              voice={voice}
              autoPlay={!muted && !conceal && (!reverse || flipped)}
              conceal={conceal}
            />
          )}
          {flipped ? (
            <div className="border-t-2 border-dashed border-accent pt-4 motion-safe:animate-reveal">
              <WordBack item={item} voice={voice} />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {t(paper ? "flipHintPaper" : reverse ? "flipHintReverse" : "flipHint")}
            </p>
          )}
        </div>
      </div>

      {flipped ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("rateLabel")}>
          {GRADES.map(({ rating, key, tone }) => (
            <button
              key={rating}
              type="button"
              onClick={() => answer(rating)}
              className={cn(
                "flex min-h-14 press-3d flex-col items-center justify-center rounded-xl px-1 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tone,
              )}
            >
              {t(`rating.${key}`)}
              <span className="text-xs font-medium opacity-90">{label(rating)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="min-h-13 press-3d rounded-2xl bg-lime text-base font-bold text-lime-foreground [--press:var(--lime-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("show")}
        </button>
      )}
    </div>
  );
}
