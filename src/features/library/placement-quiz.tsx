"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import { Button } from "@/components/ui/button";
import type { PlacementAnswer } from "@/lib/library/placement";
import { buildMcq, type ChoiceSense } from "@/lib/review/mcq";
import type { Voice } from "@/lib/media/tts-azure";
import { e2eAnswer } from "../review/e2e";
import type { ListWord } from "./library-data";

const toChoice = (w: ListWord): ChoiceSense => ({
  senseId: w.senseId,
  wordId: w.wordId || w.senseId,
  lemma: w.lemma,
  pos: w.pos as ChoiceSense["pos"],
  meaning: w.meaning,
});

/**
 * Kiểm tra đầu vào (Prompt 7.4b): mỗi câu một từ lớn + loại từ + nút nghe, 3 nút Biết / Không chắc /
 * Chưa biết; "Biết" thì hỏi thêm 1 câu trắc nghiệm chọn nghĩa (đáp án nhiễu lấy từ chính danh sách),
 * sai thì tính là chưa biết. Không báo đúng/sai để làm nhanh. "Kết thúc" dùng các câu đã trả lời.
 */
export function PlacementQuiz({
  sample,
  pool,
  voice,
  onFinish,
  onCancel,
}: {
  sample: readonly ListWord[];
  /** Mọi từ của danh sách, để lấy đáp án nhiễu. */
  pool: readonly ListWord[];
  voice: Voice;
  onFinish: (answers: Map<string, PlacementAnswer>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("library.placement");
  const tw = useTranslations("wordCard");
  const [answers, setAnswers] = useState(() => new Map<string, PlacementAnswer>());
  const [verifying, setVerifying] = useState(false);
  const index = answers.size;
  const word = sample[index];
  const choices = useMemo(() => pool.map(toChoice), [pool]);
  const mcq = useMemo(
    () => (word ? buildMcq(toChoice(word), choices, { direction: "word-to-meaning" }) : null),
    [word, choices],
  );

  function answer(value: PlacementAnswer) {
    if (!word) return;
    const next = new Map(answers).set(word.senseId, value);
    setAnswers(next);
    setVerifying(false);
    if (next.size >= sample.length) onFinish(next);
  }

  if (!word) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-muted-foreground">
          {t("progress", { current: index + 1, total: sample.length })}
        </p>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t("progressLabel")}
          aria-valuemin={0}
          aria-valuemax={sample.length}
          aria-valuenow={index}
        >
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${(index / sample.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/60 p-5 text-center">
        <p className="text-3xl font-bold break-words" lang="en" data-testid="placement-word">
          {word.lemma}
        </p>
        <p className="text-sm text-muted-foreground">{tw(`pos.${word.pos}` as "pos.noun")}</p>
        <AudioButton key={word.senseId} text={word.lemma} voice={voice} url={null} />
      </div>

      {verifying && mcq ? (
        <div className="flex flex-col gap-2" {...e2eAnswer(mcq.options[mcq.correctIndex]!.label)}>
          <p className="text-center text-sm text-muted-foreground">{t("verify")}</p>
          {mcq.options.map((option, i) => (
            <Button
              key={option.senseId}
              variant="outline"
              className="h-auto min-h-12 justify-start py-2 text-left whitespace-normal"
              onClick={() => answer(i === mcq.correctIndex ? "known" : "unknown")}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button className="min-h-12" onClick={() => (mcq ? setVerifying(true) : answer("known"))}>
            {t("known")}
          </Button>
          <Button variant="outline" className="min-h-12" onClick={() => answer("unsure")}>
            {t("unsure")}
          </Button>
          <Button variant="outline" className="min-h-12" onClick={() => answer("unknown")}>
            {t("unknown")}
          </Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" className="min-h-11 flex-1" onClick={onCancel}>
          {t("cancel")}
        </Button>
        {index > 0 && (
          <Button variant="ghost" className="min-h-11 flex-1" onClick={() => onFinish(answers)}>
            {t("finishEarly")}
          </Button>
        )}
      </div>
    </div>
  );
}
