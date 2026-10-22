"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Mcq } from "@/lib/review/mcq";
import { cn } from "@/lib/utils";
import type { ModeProps } from "./types";
import { WordBack, WordHead } from "./word-face";

/** Đúng thì tự chuyển câu sau chừng này ms; sai thì chờ người học bấm Tiếp. */
const AUTO_NEXT_MS = 700;

/** Trắc nghiệm 4 đáp án: chọn nghĩa của từ, hoặc chọn từ cho nghĩa (chiều ngược). */
export function MultipleChoice({ item, voice, muted, onAnswer, mcq }: ModeProps & { mcq: Mcq }) {
  const t = useTranslations("review");
  const [shownAt] = useState(() => Date.now());
  const [picked, setPicked] = useState<{ index: number; ms: number } | null>(null);
  const correct = picked?.index === mcq.correctIndex;

  function choose(index: number) {
    if (picked) return;
    setPicked({ index, ms: Date.now() - shownAt });
  }

  function next() {
    if (picked) onAnswer({ correct: picked.index === mcq.correctIndex, responseMs: picked.ms });
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

  const toWord = mcq.direction === "meaning-to-word";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground">
        {t(toWord ? "mcqPickWord" : "mcqPickMeaning")}
      </p>
      {toWord ? (
        <p className="text-center text-2xl font-semibold">{mcq.prompt}</p>
      ) : (
        <WordHead item={item} voice={voice} autoPlay={!muted} />
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
                lang={toWord ? "en" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring",
                  picked && isAnswer && "border-green-500 bg-green-50 dark:bg-green-950",
                  isPicked && !isAnswer && "border-red-500 bg-red-50 dark:bg-red-950",
                  picked && !isAnswer && !isPicked && "opacity-60",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {picked && isAnswer ? (
                    <Check className="size-4 text-green-700" aria-label={t("correctAnswer")} />
                  ) : isPicked ? (
                    <X className="size-4 text-red-700" aria-label={t("yourAnswer")} />
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
            "text-center font-semibold",
            correct ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300",
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
