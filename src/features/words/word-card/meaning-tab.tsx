"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { LayerFooter, MineBadge, MineItem, useCard } from "./parts";

export function MeaningTab() {
  const t = useTranslations("wordCard");
  const { view, open, addSense } = useCard();
  const multiple = view.senses.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {view.senses.map((sense) => (
        <article
          key={sense.senseId}
          className="flex flex-col gap-2 rounded-xl border p-3"
          aria-label={t("senseN", { number: sense.number })}
        >
          {multiple && (
            <p className="text-xs font-semibold text-muted-foreground">
              {t("senseN", { number: sense.number })}
            </p>
          )}
          {sense.customMeaning ? (
            <div className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-medium">
                <MineBadge />
                {sense.customMeaning}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("original", { meaning: sense.meaning_vi })}
              </p>
            </div>
          ) : (
            <p className="text-lg font-medium">{sense.meaning_vi}</p>
          )}
          <p className="text-sm text-muted-foreground" lang="en">
            {sense.definition_en}
          </p>

          {sense.userWordId && sense.additions.meaning.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sense.additions.meaning.map((note) => (
                <MineItem
                  key={note.id}
                  layer="meaning"
                  userWordId={sense.userWordId!}
                  itemId={note.id}
                >
                  <p className="text-sm whitespace-pre-line">{note.text}</p>
                </MineItem>
              ))}
            </ul>
          )}

          {sense.userWordId ? (
            <div className="flex flex-wrap gap-x-3">
              <button
                type="button"
                onClick={() => open({ kind: "meaning", senseId: sense.senseId })}
                className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Pencil className="size-4" aria-hidden />
                {t("changeMeaning")}
              </button>
            </div>
          ) : (
            view.inNotebook && (
              <button
                type="button"
                onClick={() => addSense(sense.senseId)}
                className="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Plus className="size-4" aria-hidden />
                {t("addSenseToNotebook")}
              </button>
            )
          )}
          <LayerFooter layer="meaning" senseId={sense.senseId} canAdd={!!sense.userWordId} />
        </article>
      ))}
    </div>
  );
}
