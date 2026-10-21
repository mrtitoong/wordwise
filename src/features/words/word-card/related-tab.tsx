"use client";

import { useTranslations } from "next-intl";
import { LayerFooter, MineItem, SectionTitle, WordChip, useCard } from "./parts";

export function RelatedTab() {
  const t = useTranslations("wordCard");
  const { view } = useCard();
  const { content } = view;
  const multiple = view.senses.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {view.senses.map((sense) => {
        const mine = sense.userWordId ? sense.additions.related : [];
        if (
          sense.synonyms.length + sense.antonyms.length + mine.length === 0 &&
          !sense.userWordId
        ) {
          return null;
        }
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
            {mine.length > 0 && (
              <ul className="flex flex-col gap-2">
                {mine.map((item) => (
                  <MineItem
                    key={item.id}
                    layer="related"
                    userWordId={sense.userWordId!}
                    itemId={item.id}
                  >
                    <p className="font-medium" lang="en">
                      {item.word}
                    </p>
                    {item.note && <p className="text-sm text-muted-foreground">{item.note}</p>}
                  </MineItem>
                ))}
              </ul>
            )}
            {sense.synonyms.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionTitle>{t("related.synonyms")}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {sense.synonyms.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <WordChip word={s.word} />
                      <p className="flex-1 pt-2.5 text-sm text-muted-foreground">{s.nuance_vi}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sense.antonyms.length > 0 && (
              <div className="flex flex-col gap-2">
                <SectionTitle>{t("related.antonyms")}</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {sense.antonyms.map((a, i) => (
                    <WordChip key={i} word={a.word} />
                  ))}
                </div>
              </div>
            )}
            <LayerFooter layer="related" senseId={sense.senseId} canAdd={!!sense.userWordId} />
          </section>
        );
      })}

      {(content.word_family.length > 0 || content.homonyms.length > 0) && (
        <section className="flex flex-col gap-4">
          {content.word_family.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionTitle>{t("related.family")}</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {content.word_family.map((member, i) => (
                  <WordChip key={i} word={member.word} pos={member.pos}>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t(`posShort.${member.pos}`)}
                      {member.note_vi ? `, ${member.note_vi}` : ""}
                    </span>
                  </WordChip>
                ))}
              </div>
            </div>
          )}
          {content.homonyms.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionTitle>{t("related.homonyms")}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {content.homonyms.map((h, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <WordChip word={h.word} />
                    <p className="flex-1 pt-2.5 text-sm">
                      <span className="text-muted-foreground">{t(`related.${h.kind}`)} · </span>
                      {h.meaning_vi}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <LayerFooter layer="related" senseId={null} canAdd={false} />
        </section>
      )}
    </div>
  );
}
