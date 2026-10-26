"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { WordCardBody } from "@/features/words/word-card/word-card-screen";
import type { Voice } from "@/lib/media/tts-azure";
import type { PreparedCard } from "../session-content";

/**
 * Từ mới: xem thẻ đầy đủ 5 tab ngay trong phiên (thêm ghi chú/mẹo được, không rời phiên). Bấm "Đã
 * xem xong" thì phiên tự ghi lượt đầu là "Khó" (không bắt tự chấm khi vừa đọc xong); từ quay lại
 * sau vài câu dưới dạng câu hỏi app tự chấm.
 */
export function NewWordIntro({
  item,
  voice,
  muted,
  onContinue,
}: {
  item: PreparedCard;
  voice: Voice;
  muted: boolean;
  onContinue: (viewMs: number) => void;
}) {
  const t = useTranslations("review");
  const [shownAt] = useState(() => Date.now());

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Chỉ khi không gõ/bấm gì khác (ô nhập, tab, bảng thêm ghi chú đang mở).
      if (event.target !== document.body) return;
      if (event.key === "Enter") {
        event.preventDefault();
        onContinue(Date.now() - shownAt);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue, shownAt]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="self-center rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
        {t("newWord")}
      </p>
      <div className="rounded-3xl border bg-card px-4 pb-4 shadow-sm">
        <WordCardBody wordId={item.word.id} inSession autoPlay={muted ? null : voice} />
      </div>
      <div className="sticky bottom-0 -mx-4 bg-background/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button className="min-h-12 w-full" onClick={() => onContinue(Date.now() - shownAt)}>
          {t("gotIt")}
        </Button>
        <p className="pt-1 text-center text-xs text-muted-foreground">{t("gotItHint")}</p>
      </div>
    </div>
  );
}
