"use client";

import { useTranslations } from "next-intl";
import { Highlighted, LayerFooter, MineItem, SectionTitle, useCard } from "./parts";

export function UsageTab() {
  const t = useTranslations("wordCard");
  const { view } = useCard();
  const multiple = view.senses.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {view.senses.map((sense) => {
        const mine = sense.userWordId ? sense.additions.usage : [];
        const empty =
          sense.collocations.length +
            sense.idioms.length +
            sense.common_mistakes.length +
            mine.length ===
          0;
        if (empty && !sense.userWordId) return null;
        return (
          <section key={sense.senseId} className="flex flex-col gap-4">
            {multiple && (
              <h3 className="font-semibold">
                {t("senseHeading", {
                  number: sense.number,
                  meaning: sense.customMeaning ?? sense.meaning_vi,
                })}
              </h3>
            )}

            {(mine.length > 0 || sense.collocations.length > 0) && (
              <div className="flex flex-col gap-2">
                <SectionTitle>{t("usage.collocations")}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {mine.map((item) => (
                    <MineItem
                      key={item.id}
                      layer="usage"
                      userWordId={sense.userWordId!}
                      itemId={item.id}
                    >
                      <p className="font-medium" lang="en">
                        {item.phrase}
                      </p>
                      {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                    </MineItem>
                  ))}
                  {sense.collocations.map((c, i) => (
                    <li key={i} className="flex flex-col gap-0.5 rounded-xl border p-3">
                      <p className="font-medium" lang="en">
                        {c.phrase}
                      </p>
                      <p className="text-xs text-muted-foreground" lang="en">
                        {c.pattern}
                      </p>
                      {c.example && (
                        <p className="text-sm" lang="en">
                          <Highlighted
                            text={c.example}
                            terms={[c.phrase, ...view.highlightTerms]}
                          />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sense.idioms.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionTitle>{t("usage.idioms")}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {sense.idioms.map((idiom, i) => (
                    <li key={i} className="flex flex-col gap-0.5 rounded-xl border p-3">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium" lang="en">
                          {idiom.phrase}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t(`register.${idiom.register}`)}
                        </span>
                      </p>
                      <p className="text-sm">{idiom.meaning_vi}</p>
                      {idiom.example && (
                        <p className="text-sm text-muted-foreground" lang="en">
                          {idiom.example}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sense.common_mistakes.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionTitle>{t("usage.mistakes")}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {sense.common_mistakes.map((m, i) => (
                    <li key={i} className="flex flex-col gap-1 rounded-xl border p-3">
                      <p className="text-sm" lang="en">
                        <span
                          className="font-semibold text-destructive"
                          aria-label={t("usage.wrong")}
                        >
                          ✗
                        </span>{" "}
                        <span className="line-through decoration-destructive/60">{m.wrong}</span>
                      </p>
                      <p className="text-sm" lang="en">
                        <span
                          className="font-semibold text-emerald-700 dark:text-emerald-400"
                          aria-label={t("usage.correct")}
                        >
                          ✓
                        </span>{" "}
                        {m.correct}
                      </p>
                      <p className="text-sm text-muted-foreground">{m.explanation_vi}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <LayerFooter layer="usage" senseId={sense.senseId} canAdd={!!sense.userWordId} />
          </section>
        );
      })}
    </div>
  );
}
