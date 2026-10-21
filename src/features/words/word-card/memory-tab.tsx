"use client";

import { useTranslations } from "next-intl";
import { LayerFooter, MineItem, SectionTitle, useCard } from "./parts";

/** Tab Ghi nhớ: nội dung cấp từ; mẹo nhớ tự thêm lưu ở user_words chính. */
export function MemoryTab() {
  const t = useTranslations("wordCard");
  const { view } = useCard();
  const { content } = view;
  const primary = view.senses.find((s) => s.userWordId === view.primaryUserWordId);
  const mine = primary ? primary.additions.memory : [];

  return (
    <div className="flex flex-col gap-5">
      {(mine.length > 0 || content.mnemonics.length > 0) && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("memory.mnemonics")}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {mine.map((item) => (
              <MineItem
                key={item.id}
                layer="memory"
                userWordId={view.primaryUserWordId!}
                itemId={item.id}
              >
                <p className="text-sm whitespace-pre-line">{item.text}</p>
              </MineItem>
            ))}
            {content.mnemonics.map((m, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {t(`memory.type.${m.type}`)}
                </p>
                <p className="text-sm">{m.text_vi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.confusables.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("memory.confusables")}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {content.confusables.map((c, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-xl border p-3">
                <p className="font-medium" lang="en">
                  {t("memory.versus", { a: content.lemma, b: c.word })}
                </p>
                <p className="text-sm text-muted-foreground">{c.difference_vi}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.etymology_vi && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("memory.etymology")}</SectionTitle>
          <p className="text-sm">{content.etymology_vi}</p>
        </section>
      )}

      <LayerFooter layer="memory" senseId={null} canAdd={!!view.primaryUserWordId} />
    </div>
  );
}
