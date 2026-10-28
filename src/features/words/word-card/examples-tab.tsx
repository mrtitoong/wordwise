"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import { useUserImageUrl } from "@/features/media/user-images";
import type { Voice } from "@/lib/media/tts-azure";
import { sentenceAudioUrl } from "@/features/media/sentence-audio";
import type { SenseView } from "@/lib/words/word-card";
import { Highlighted, LayerFooter, MineItem, SectionTitle, useCard } from "./parts";

function ExampleItem({ sense, index, voice }: { sense: SenseView; index: number; voice: Voice }) {
  const t = useTranslations("wordCard");
  const { view } = useCard();
  const [shown, setShown] = useState(false);
  const example = sense.examples[index]!;
  return (
    <li className="flex flex-col gap-1 rounded-xl border p-3">
      <p lang="en">
        <Highlighted text={example.sentence} terms={[example.highlight, ...view.highlightTerms]} />
      </p>
      {shown && <p className="text-sm text-muted-foreground">{example.translation_vi}</p>}
      <div className="flex items-center gap-1">
        <AudioButton
          text={example.sentence}
          voice={voice}
          className="-ml-2"
          resolveUrl={() => sentenceAudioUrl(sense.senseId, index, voice, example.sentence)}
        />
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => setShown(!shown)}
          className="inline-flex min-h-11 items-center px-1 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t(shown ? "examples.hideTranslation" : "examples.showTranslation")}
        </button>
      </div>
    </li>
  );
}

/** Ảnh gốc nơi gặp từ: ảnh chụp người dùng giữ lại (bucket riêng tư → signed URL). */
function ContextImage({ src }: { src: string }) {
  const t = useTranslations("wordCard");
  const { owner } = useCard();
  const isPrivate = src.startsWith("storage://");
  const signed = useUserImageUrl(isPrivate ? src : null, owner);
  const url = isPrivate ? signed : src;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={t("examples.contextImage")}
        className="max-h-48 w-full rounded-lg object-cover"
        loading="lazy"
      />
    </a>
  );
}

export function ExamplesTab({ voice }: { voice: Voice }) {
  const t = useTranslations("wordCard");
  const { view } = useCard();
  const multiple = view.senses.length > 1;

  return (
    <div className="flex flex-col gap-5">
      {view.contextSentences.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("examples.context")}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {view.contextSentences.map((c) => (
              <li
                key={c.entryId}
                className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-accent/40 p-3"
              >
                {c.source && <p className="text-xs text-muted-foreground">{c.source}</p>}
                {c.article && (
                  <p className="text-xs text-muted-foreground">
                    {t.rich("examples.fromArticle", {
                      title: c.article.title,
                      link: (chunks) => (
                        <a
                          href={c.article!.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex min-h-11 items-center text-primary underline underline-offset-2"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </p>
                )}
                {c.imageUrl && <ContextImage src={c.imageUrl} />}
                <p lang="en">
                  <Highlighted text={c.sentence} terms={view.highlightTerms} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.senses.map((sense) => {
        const mine = sense.userWordId ? sense.additions.examples : [];
        if (sense.examples.length === 0 && mine.length === 0 && !sense.userWordId) return null;
        return (
          <section key={sense.senseId} className="flex flex-col gap-2">
            {multiple && (
              <SectionTitle>
                {t("senseHeading", {
                  number: sense.number,
                  meaning: sense.customMeaning ?? sense.meaning_vi,
                })}
              </SectionTitle>
            )}
            <ul className="flex flex-col gap-2">
              {mine.map((item) => (
                <MineItem
                  key={item.id}
                  layer="examples"
                  userWordId={sense.userWordId!}
                  itemId={item.id}
                >
                  <p lang="en">
                    <Highlighted text={item.sentence} terms={view.highlightTerms} />
                  </p>
                  {item.translation_vi && (
                    <p className="text-sm text-muted-foreground">{item.translation_vi}</p>
                  )}
                </MineItem>
              ))}
              {sense.examples.map((_, index) => (
                <ExampleItem key={index} sense={sense} index={index} voice={voice} />
              ))}
            </ul>
            <LayerFooter layer="examples" senseId={sense.senseId} canAdd={!!sense.userWordId} />
          </section>
        );
      })}
    </div>
  );
}
