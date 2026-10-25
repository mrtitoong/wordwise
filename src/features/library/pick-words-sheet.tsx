"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { ListWord } from "./library-data";

/** "Chọn lọc từ": bỏ tích những từ không muốn học (null = cả danh sách). */
export function PickWordsSheet({
  words,
  failed,
  selected,
  onRetry,
  onClose,
  onDone,
}: {
  words: ListWord[] | null;
  failed: boolean;
  selected: ReadonlySet<string> | null;
  onRetry: () => void;
  onClose: () => void;
  onDone: (selected: Set<string> | null) => void;
}) {
  const t = useTranslations("library.pick");
  const tc = useTranslations("wordCard");
  const [draft, setDraft] = useState<Set<string> | null>(selected ? new Set(selected) : null);
  const isOn = (id: string) => !draft || draft.has(id);
  const count = words ? words.filter((w) => isOn(w.senseId)).length : 0;

  function toggle(id: string) {
    const next = new Set(draft ?? words!.map((w) => w.senseId));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={t("title")}>
      {!words ? (
        failed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-muted-foreground">{t("failed")}</p>
            <Button variant="outline" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <p className="py-6 text-center text-muted-foreground" role="status">
            {t("loading")}
          </p>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium" aria-live="polite">
              {t("count", { count, total: words.length })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(count === words.length ? new Set() : null)}
            >
              {count === words.length ? t("selectNone") : t("selectAll")}
            </Button>
          </div>
          <ul className="-mx-4 flex flex-col divide-y overflow-y-auto px-4">
            {words.map((word) => (
              <li key={word.senseId}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={isOn(word.senseId)}
                    onChange={() => toggle(word.senseId)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-medium" lang="en">
                        {word.lemma}
                      </span>
                      {word.pos && (
                        <span className="text-xs text-muted-foreground">
                          {tc(`posShort.${word.pos as "noun"}`)}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{word.meaning}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            className="min-h-11"
            disabled={count === 0}
            onClick={() => onDone(count === words.length ? null : draft)}
          >
            {t("done")}
          </Button>
        </>
      )}
    </Sheet>
  );
}
