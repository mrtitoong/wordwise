"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { Rating } from "ts-fsrs";
import { AudioButton } from "@/components/audio-button";
import { Button } from "@/components/ui/button";
import { pinyinOfSense, zhCardInfo } from "@/lib/lang/zh/card";
import {
  HINT_AFTER_MISSES,
  STROKE_LENIENCY,
  hanziParts,
  hanziResult,
  showsOutline,
  strokeDataUrl,
} from "@/lib/review/hanzi";
import { MAX_HINT_LEVEL } from "@/lib/review/writing";
import type { MasteryLevel } from "@/lib/srs/mastery";
import { cn } from "@/lib/utils";
import { e2eAnswer } from "../e2e";
import type { ModeProps } from "./types";
import { WordBack, WordHead } from "./word-face";

/** Đúng thì tự chuyển câu sau chừng này ms. */
const AUTO_NEXT_MS = 1200;
const PAD_MAX_PX = 320;

type CharData = { strokes: string[] };

/** Hanzi Writer chỉ đọc màu hex/rgb nên không dùng được biến màu của giao diện. */
function padColors() {
  const dark = document.documentElement.classList.contains("dark");
  return dark
    ? { strokeColor: "#f5f5f7", outlineColor: "#4a4a55", drawingColor: "#a897ff" }
    : { strokeColor: "#1f1f24", outlineColor: "#dcdce3", drawingColor: "#6c4cf5" };
}

async function loadStrokes(chars: readonly string[]): Promise<Map<string, CharData> | null> {
  try {
    const entries = await Promise.all(
      chars.map(async (char) => {
        const response = await fetch(strokeDataUrl(char));
        if (!response.ok) throw new Error(char);
        return [char, (await response.json()) as CharData] as const;
      }),
    );
    return new Map(entries);
  } catch {
    return null;
  }
}

type Phase = "loading" | "writing" | "finished" | "revealed";

/**
 * Viết chữ: viết lần lượt từng chữ của từ theo đúng thứ tự nét. Mức 0–2 có nét mờ. Thiếu dữ liệu nét
 * (offline chưa tải, chữ hiếm) thì báo `onMissing` để phiên chuyển sang flashcard viết ra giấy.
 */
export function HanziWriting({
  item,
  voice,
  muted,
  onAnswer,
  level,
  onMissing,
}: ModeProps & { level: MasteryLevel; onMissing: () => void }) {
  const t = useTranslations("review.hanzi");
  const tr = useTranslations("review");
  const { content, media } = item.word;
  const parts = useMemo(() => hanziParts(content.lemma), [content.lemma]);
  const writable = useMemo(() => parts.filter((p) => p.write).map((p) => p.char), [parts]);
  const zh = zhCardInfo(content);

  const [shownAt] = useState(() => Date.now());
  const [phase, setPhase] = useState<Phase>("loading");
  const [strokeData, setStrokeData] = useState<Map<string, CharData> | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ correct: boolean; usedHint: boolean } | null>(null);
  const [hints, setHints] = useState(0);

  const pad = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const nextStroke = useRef(0);
  const mistakes = useRef(0);
  const hintCount = useRef(0);

  useEffect(() => {
    let live = true;
    void loadStrokes(writable).then((data) => {
      if (!live) return;
      if (!data || writable.length === 0) {
        onMissing();
        return;
      }
      setStrokeData(data);
      setPhase("writing");
    });
    return () => {
      live = false;
    };
    // Tải một lần khi câu hiện ra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writable]);

  useEffect(() => {
    const element = pad.current;
    const char = writable[index];
    if (phase !== "writing" || !element || !strokeData || !char) return;
    const size = Math.min(element.clientWidth, PAD_MAX_PX);
    nextStroke.current = 0;
    const instance = HanziWriter.create(element, char, {
      width: size,
      height: size,
      padding: 12,
      showCharacter: false,
      showOutline: showsOutline(level) || hintCount.current > 1,
      showHintAfterMisses: HINT_AFTER_MISSES,
      leniency: STROKE_LENIENCY,
      drawingWidth: 18,
      charDataLoader: (wanted, onLoad) => {
        onLoad(strokeData.get(wanted) as Parameters<typeof onLoad>[0]);
      },
      ...padColors(),
    });
    writer.current = instance;
    void instance.quiz({
      onMistake: () => {
        mistakes.current++;
      },
      onCorrectStroke: (stroke) => {
        nextStroke.current = stroke.strokeNum + 1;
      },
      onComplete: () => {
        if (index + 1 < writable.length) {
          setIndex(index + 1);
          return;
        }
        const strokes = writable.reduce(
          (sum, part) => sum + (strokeData.get(part)?.strokes.length ?? 0),
          0,
        );
        setResult(hanziResult({ strokes, mistakes: mistakes.current, hints: hintCount.current }));
        setPhase("finished");
      },
    });
    return () => {
      instance.cancelQuiz();
      writer.current = null;
      element.replaceChildren();
    };
  }, [phase, index, strokeData, writable, level]);

  function answer(correct: boolean, usedHint: boolean, revealed = false) {
    onAnswer({
      correct,
      responseMs: Date.now() - shownAt,
      usedHint,
      revealed,
      hintLevel: Math.min(hintCount.current, MAX_HINT_LEVEL),
      untimed: true,
      maxRating: Rating.Good,
    });
  }

  useEffect(() => {
    if (phase !== "finished" || !result?.correct) return;
    const timer = setTimeout(() => answer(true, result.usedHint), AUTO_NEXT_MS);
    return () => clearTimeout(timer);
  });

  function hint() {
    hintCount.current++;
    setHints(hintCount.current);
    void writer.current?.highlightStroke(nextStroke.current);
    if (hintCount.current > 1) void writer.current?.showOutline();
  }

  if (phase === "finished" || phase === "revealed") {
    const right = phase === "finished" && !!result?.correct;
    return (
      <div className="flex flex-1 flex-col gap-4" {...e2eAnswer(content.lemma)}>
        <WordHead item={item} voice={voice} autoPlay={!muted} />
        <p
          role="status"
          className={cn(
            "text-center font-semibold",
            right ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300",
          )}
        >
          {tr(right ? "right" : "wrong")}
        </p>
        {!right && (
          <>
            <WordBack item={item} voice={voice} />
            <Button
              className="mt-auto min-h-12"
              onClick={() => answer(false, false, phase === "revealed")}
            >
              {tr("next")}
            </Button>
          </>
        )}
      </div>
    );
  }

  let written = 0;
  return (
    <div className="flex flex-1 flex-col items-center gap-3" {...e2eAnswer(content.lemma)}>
      <p className="text-sm text-muted-foreground">{t("prompt")}</p>
      <p className="text-center text-xl font-semibold">{item.meaning}</p>
      <div className="flex items-center gap-1">
        {zh && (
          <span className="text-lg" lang="zh-Latn">
            {pinyinOfSense(zh, item.senseIndex)}
          </span>
        )}
        <AudioButton
          text={content.lemma}
          voice={voice}
          language={content.language}
          url={media.audio[voice]}
          autoPlay={!muted}
        />
      </div>

      {writable.length > 1 || parts.length > 1 ? (
        <ol className="flex gap-1" aria-label={t("progress")}>
          {parts.map((part, position) => {
            const at = part.write ? written++ : -1;
            const done = !part.write || at < index;
            return (
              <li
                key={position}
                lang={content.language}
                aria-current={at === index ? "step" : undefined}
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg border text-xl",
                  at === index && "border-2 border-primary",
                )}
              >
                {done ? part.char : ""}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div
        role="group"
        aria-label={t("pad")}
        className="relative aspect-square w-full max-w-80 touch-none rounded-2xl border-2 bg-card"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed" />
        <span aria-hidden className="absolute inset-y-0 left-1/2 border-l border-dashed" />
        <div ref={pad} className="relative size-full" />
      </div>

      <div className="mt-auto grid w-full grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="min-h-12"
          disabled={phase !== "writing"}
          onClick={hint}
        >
          <Lightbulb className="size-4" aria-hidden />
          {hints > 0 ? t("hintAgain") : t("hint")}
        </Button>
        <Button variant="outline" className="min-h-12" onClick={() => setPhase("revealed")}>
          {t("giveUp")}
        </Button>
      </div>
    </div>
  );
}
