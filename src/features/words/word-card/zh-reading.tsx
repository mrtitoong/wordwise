"use client";

import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import type { ZhCardInfo } from "@/lib/lang/zh/card";
import type { Voice } from "@/lib/media/tts-azure";

/** Đầu thẻ tiếng Trung: nghe, pinyin, âm Hán Việt từng chữ và dạng phồn thể. */
export function ZhReading({
  info,
  lemma,
  voice,
  url,
  autoPlay,
}: {
  info: ZhCardInfo;
  lemma: string;
  voice: Voice;
  url: string | null;
  autoPlay: boolean;
}) {
  const t = useTranslations("wordCard.zh");
  const hanViet = info.hanViet.filter((item) => item.am);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <AudioButton
          text={lemma}
          voice={voice}
          language="zh"
          url={url}
          autoPlay={autoPlay}
          className="-ml-2"
        />
        <span className="text-lg" lang="zh-Latn">
          {info.pinyin}
        </span>
      </div>
      {hanViet.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("hanViet")} </span>
          <span className="font-medium uppercase">{hanViet.map((item) => item.am).join(" ")}</span>
        </p>
      )}
      {info.traditional && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("traditional")} </span>
          <span lang="zh-Hant">{info.traditional}</span>
        </p>
      )}
    </div>
  );
}
