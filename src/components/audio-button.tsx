"use client";

import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { browserPlayerEnv, createPlayer, type PlaybackRate } from "@/lib/audio/player";
import type { Voice } from "@/lib/media/tts-azure";
import { cn } from "@/lib/utils";

export interface AudioButtonProps {
  /** Văn bản được đọc (từ hoặc câu); dùng khi phải đọc bằng giọng trình duyệt. */
  text: string;
  voice: Voice;
  /** URL MP3 đã có (audio của từ). */
  url?: string | null;
  /** Lấy URL khi bấm (audio câu ví dụ). */
  resolveUrl?: () => Promise<string | null>;
  /** Hiện nút đổi tốc độ 1x / 0.75x bên cạnh. */
  showRate?: boolean;
  /** Tự phát một lần khi hiện ra (thẻ trong phiên ôn). */
  autoPlay?: boolean;
  className?: string;
}

/** Nút loa phát audio; lỗi hoặc chưa có file thì đọc bằng giọng của trình duyệt. */
export function AudioButton({
  text,
  voice,
  url,
  resolveUrl,
  showRate,
  autoPlay,
  className,
}: AudioButtonProps) {
  const t = useTranslations("audio");
  const player = useMemo(() => createPlayer(browserPlayerEnv()), []);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    if (!autoPlay) return;
    void player.play({ url, resolveUrl, text, voice, rate: 1, onEnd: () => {} });
    // Chỉ phát khi thẻ hiện ra (đổi từ), không phát lại khi đổi tốc độ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, text, voice, url]);

  async function play() {
    setPlaying(true);
    const result = await player.play({
      url,
      resolveUrl,
      text,
      voice,
      rate,
      onEnd: () => setPlaying(false),
    });
    if (result === "none") setPlaying(false);
  }

  const voiceLabel = t(voice === "us" ? "voiceUs" : "voiceUk");

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => void play()}
        aria-label={t("play", { voice: voiceLabel })}
        title={t("play", { voice: voiceLabel })}
        data-playing={playing}
        className={cn(
          "flex size-11 items-center justify-center rounded-full text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
          playing && "bg-muted",
        )}
      >
        <Volume2 className={cn("size-5", playing && "animate-pulse")} aria-hidden />
      </button>
      {showRate && (
        <button
          type="button"
          onClick={() => setRate(rate === 1 ? 0.75 : 1)}
          aria-label={t("rate", { rate })}
          aria-pressed={rate === 0.75}
          className="flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-xs font-medium text-muted-foreground tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:text-primary"
        >
          {rate === 1 ? "1x" : "0.75x"}
        </button>
      )}
    </span>
  );
}
