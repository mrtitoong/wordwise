"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Mcq } from "@/lib/review/mcq";
import { readingConcealed } from "@/lib/review/cues";
import { replaysAsHint } from "@/lib/review/listening";
import { cn } from "@/lib/utils";
import { e2eAnswer } from "../e2e";
import { ListenPlayer } from "./listen-player";
import type { ModeProps } from "./types";
import { WordBack, WordHead } from "./word-face";

/** Đúng thì tự chuyển câu sau chừng này ms; sai thì chờ người học bấm Tiếp. */
const AUTO_NEXT_MS = 700;

/**
 * Trắc nghiệm 4 đáp án: chọn nghĩa của từ, hoặc chọn từ cho nghĩa (chiều ngược). `listen`: tập
 * nghe – chỉ nghe từ (không hiện chữ) rồi chọn nghĩa; nghe lại quá 3 lần tính là dùng gợi ý.
 */
export function MultipleChoice({
  item,
  voice,
  muted,
  onAnswer,
  mcq,
  listen = false,
}: ModeProps & { mcq: Mcq; listen?: boolean }) {
  const t = useTranslations("review");
  const [shownAt] = useState(() => Date.now());
  const [picked, setPicked] = useState<{ index: number; ms: number } | null>(null);
  const [replays, setReplays] = useState(0);
  const correct = picked?.index === mcq.correctIndex;

  function choose(index: number) {
    if (picked) return;
    setPicked({ index, ms: Date.now() - shownAt });
  }

  function next() {
    if (!picked) return;
    onAnswer({
      correct: picked.index === mcq.correctIndex,
      responseMs: picked.ms,
      ...(listen ? { usedHint: replaysAsHint(replays) } : {}),
    });
  }

  useEffect(() => {
    if (!picked || !correct) return;
    const timer = setTimeout(next, AUTO_NEXT_MS);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      const n = Number(event.key);
      if (!picked && n >= 1 && n <= mcq.options.length) {
        event.preventDefault();
        choose(n - 1);
      } else if (picked && !correct && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toWord = !listen && mcq.direction === "meaning-to-word";
  const language = item.word.content.language;
  const conceal = readingConcealed(language, item.card, !!picked);

  return (
    <div className="flex flex-1 flex-col gap-4" {...e2eAnswer(item.word.content.lemma)}>
      <p className="text-center text-sm text-muted-foreground">
        {t(listen ? "listenPickMeaning" : toWord ? "mcqPickWord" : "mcqPickMeaning")}
      </p>
      {listen ? (
        picked ? (
          <WordHead item={item} voice={voice} autoPlay={false} />
        ) : (
          <ListenPlayer
            text={item.word.content.lemma}
            voice={voice}
            language={language}
            url={item.word.media.audio[voice]}
            autoPlay={!muted}
            onReplay={setReplays}
          />
        )
      ) : toWord ? (
        <p className="text-center text-2xl font-semibold">{mcq.prompt}</p>
      ) : (
        <WordHead item={item} voice={voice} autoPlay={!muted && !conceal} conceal={conceal} />
      )}

      <ul className="flex flex-col gap-2" aria-label={t("options")}>
        {mcq.options.map((option, index) => {
          const isAnswer = index === mcq.correctIndex;
          const isPicked = picked?.index === index;
          return (
            <li key={option.senseId}>
              <button
                type="button"
                disabled={!!picked}
                onClick={() => choose(index)}
                lang={toWord ? language : undefined}
                className={cn(
                  "flex min-h-14 w-full press-3d items-center gap-3 rounded-2xl border-2 border-transparent bg-card px-4 py-2 text-left font-medium [--press:var(--lift)] focus-visible:outline-2 focus-visible:outline-ring",
                  !picked && "hover:border-primary/40",
                  picked &&
                    isAnswer &&
                    "border-grade-good bg-success-soft text-success-soft-foreground [--press:var(--grade-good)] motion-safe:animate-pop",
                  isPicked &&
                    !isAnswer &&
                    "border-grade-again bg-red-50 [--press:var(--grade-again)] dark:bg-red-950",
                  picked && !isAnswer && !isPicked && "opacity-50",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">
                  {picked && isAnswer ? (
                    <Check className="size-4 text-grade-good" aria-label={t("correctAnswer")} />
                  ) : isPicked ? (
                    <X className="size-4 text-grade-again" aria-label={t("yourAnswer")} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="flex-1">{option.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {picked && (
        <p
          role="status"
          className={cn(
            "self-center rounded-xl px-3 py-1.5 text-center font-bold motion-safe:animate-pop",
            correct
              ? "bg-success-soft text-success-soft-foreground"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
          )}
        >
          {t(correct ? "right" : "wrong")}
        </p>
      )}

      {picked && !correct && (
        <>
          {toWord && <WordHead item={item} voice={voice} autoPlay={!muted} />}
          <WordBack item={item} voice={voice} />
          <Button className="min-h-12" onClick={next}>
            {t("next")}
          </Button>
        </>
      )}
    </div>
  );
}
