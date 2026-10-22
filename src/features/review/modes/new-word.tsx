"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Voice } from "@/lib/media/tts-azure";
import type { PreparedCard } from "../session-content";
import { WordBack, WordHead } from "./word-face";

/** Từ mới: xem thẻ tóm tắt (nghĩa, câu gặp, ví dụ, âm thanh) rồi mới hỏi bằng flashcard. */
export function NewWordIntro({
  item,
  voice,
  muted,
  onContinue,
}: {
  item: PreparedCard;
  voice: Voice;
  muted: boolean;
  onContinue: () => void;
}) {
  const t = useTranslations("review");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onContinue();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="self-center rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
        {t("newWord")}
      </p>
      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm">
        <WordHead item={item} voice={voice} autoPlay={!muted} />
        <WordBack item={item} voice={voice} />
        <Link
          href={`/words/${item.word.id}`}
          target="_blank"
          className="inline-flex min-h-11 items-center self-center text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("openCard")}
        </Link>
      </div>
      <Button className="min-h-12" onClick={onContinue}>
        {t("gotIt")}
      </Button>
    </div>
  );
}
