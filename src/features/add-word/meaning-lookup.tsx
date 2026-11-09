"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { reverseLookup } from "@/lib/words/request-word";
import type { ReverseItem, ReverseResponse } from "@/lib/words/reverse";

type Problem = "aiLogin" | "aiLimit" | "aiFailed" | "aiEmpty";

const PROBLEMS: Partial<Record<ReverseResponse["ai"], Problem>> = {
  login_required: "aiLogin",
  limit_reached: "aiLimit",
  unavailable: "aiFailed",
};

/** Kho chưa có từ theo nghĩa đang gõ: bấm mới hỏi AI, vì mỗi lần hỏi trừ một lượt trong ngày. */
export function MeaningLookup({
  query,
  language,
  disabled,
  onChoose,
}: {
  query: string;
  language: Language;
  disabled: boolean;
  /** Từ đã có trong kho thì mở, chưa có thì tạo: máy chủ tự biết. */
  onChoose: (word: string) => void;
}) {
  const t = useTranslations("addWord.meaningLookup");
  const tc = useTranslations("wordCard");
  const [items, setItems] = useState<ReverseItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function ask() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await reverseLookup(createClient(), query, language);
      setItems(response.items);
      setProblem(PROBLEMS[response.ai] ?? (response.items.length ? null : "aiEmpty"));
    } catch {
      setProblem("aiFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items === null && (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-11 whitespace-normal"
          disabled={disabled || busy}
          onClick={() => void ask()}
        >
          <Sparkles aria-hidden />
          {t("askAi", { query })}
        </Button>
      )}
      {problem && <p className="text-sm text-muted-foreground">{t(problem)}</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col divide-y overflow-hidden rounded-2xl bg-card lift">
          {items.map((item) => (
            <li key={item.word}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChoose(item.word)}
                className="flex min-h-12 w-full flex-col px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium" lang={language}>
                    {item.word}
                  </span>
                  {item.pos && (
                    <span className="text-xs text-muted-foreground">
                      {tc(`posShort.${item.pos}`)}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{item.meaning ?? item.nuance}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
