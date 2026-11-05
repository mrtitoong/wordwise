"use client";

import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import { pinyinOfSense, zhCardInfo } from "@/lib/lang/zh/card";
import type { Voice } from "@/lib/media/tts-azure";
import { Highlighted } from "@/features/words/word-card/parts";
import type { PreparedCard } from "../session-content";

/**
 * Từ + phiên âm + loại từ + nút nghe (dùng chung cho các chế độ). `conceal`: mặt câu hỏi ẩn cách đọc
 * (xem `readingConcealed`).
 */
export function WordHead({
  item,
  voice,
  autoPlay,
  conceal = false,
}: {
  item: PreparedCard;
  voice: Voice;
  autoPlay: boolean;
  conceal?: boolean;
}) {
  const tw = useTranslations("wordCard");
  const { content, media } = item.word;
  const ipa = content.ipa[voice] ?? content.ipa.us ?? content.ipa.uk;
  const zh = zhCardInfo(content);
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-4xl font-bold break-words" lang={content.language}>
        {content.lemma}
      </p>
      <p className="text-sm text-muted-foreground">
        {zh
          ? !conceal && (
              <span className="text-base text-foreground" lang="zh-Latn">
                {pinyinOfSense(zh, item.senseIndex)} ·{" "}
              </span>
            )
          : ipa && <span lang="en">/{ipa}/ · </span>}
        {tw(`pos.${content.pos}`)}
      </p>
      <AudioButton
        text={content.lemma}
        voice={voice}
        language={content.language}
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
  const tz = useTranslations("wordCard.zh");
  const { content } = item.word;
  const terms = [content.lemma, item.example?.highlight ?? ""].filter(Boolean);
  const zh = zhCardInfo(content);
  const hanViet = zh?.hanViet.flatMap((part) => (part.am ? [part.am] : [])) ?? [];
  const examplePinyin = zh?.examplePinyin[item.senseIndex]?.[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xl font-semibold">{item.meaning}</p>
      {hanViet.length > 0 && (
        <p className="text-center text-sm">
          <span className="text-muted-foreground">{tz("hanViet")} </span>
          <span className="font-medium uppercase">{hanViet.join(" ")}</span>
        </p>
      )}
      {item.context && (
        <p
          className="rounded-xl border-2 border-primary/30 bg-accent/40 p-3 text-sm"
          lang={content.language}
        >
          <span className="mb-1 block text-xs text-muted-foreground">{t("context")}</span>
          <Highlighted text={item.context} terms={terms} />
        </p>
      )}
      {item.example && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p lang={content.language}>
            <Highlighted text={item.example.sentence} terms={terms} />
          </p>
          {examplePinyin && (
            <p className="text-muted-foreground" lang="zh-Latn">
              {examplePinyin}
            </p>
          )}
          <p className="mt-1 text-muted-foreground">{item.example.translation_vi}</p>
          <AudioButton
            text={item.example.sentence}
            voice={voice}
            language={content.language}
            className="-ml-2"
          />
        </div>
      )}
    </div>
  );
}
