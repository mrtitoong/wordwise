"use client";

import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import type { Voice } from "@/lib/media/tts-azure";
import { Highlighted } from "@/features/words/word-card/parts";
import type { PreparedCard } from "../session-content";

/** Từ + phiên âm + loại từ + nút nghe (dùng chung cho các chế độ). */
export function WordHead({
  item,
  voice,
  autoPlay,
}: {
  item: PreparedCard;
  voice: Voice;
  autoPlay: boolean;
}) {
  const tw = useTranslations("wordCard");
  const { content, media } = item.word;
  const ipa = content.ipa[voice] ?? content.ipa.us ?? content.ipa.uk;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-4xl font-bold break-words" lang="en">
        {content.lemma}
      </p>
      <p className="text-sm text-muted-foreground">
        {ipa && <span lang="en">/{ipa}/ · </span>}
        {tw(`pos.${content.pos}`)}
      </p>
      <AudioButton
        text={content.lemma}
        voice={voice}
        url={media.audio[voice]}
        autoPlay={autoPlay}
        showRate
      />
    </div>
  );
}

/** Nghĩa, câu gặp (nếu có) và câu ví dụ có tô đậm từ. */
export function WordBack({ item, voice }: { item: PreparedCard; voice: Voice }) {
  const t = useTranslations("review");
  const terms = [item.word.content.lemma, item.example?.highlight ?? ""].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xl font-semibold">{item.meaning}</p>
      {item.context && (
        <p className="rounded-xl border-2 border-primary/30 bg-accent/40 p-3 text-sm" lang="en">
          <span className="mb-1 block text-xs text-muted-foreground">{t("context")}</span>
          <Highlighted text={item.context} terms={terms} />
        </p>
      )}
      {item.example && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p lang="en">
            <Highlighted text={item.example.sentence} terms={terms} />
          </p>
          <p className="mt-1 text-muted-foreground">{item.example.translation_vi}</p>
          <AudioButton text={item.example.sentence} voice={voice} className="-ml-2" />
        </div>
      )}
    </div>
  );
}
