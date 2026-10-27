"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { browserPlayerEnv, createPlayer, type PlaybackRate } from "@/lib/audio/player";
import type { Voice } from "@/lib/media/tts-azure";
import { sentenceAudioUrl } from "@/features/media/sentence-audio";
import { cn } from "@/lib/utils";

/** Trình duyệt đọc được bằng giọng máy (dự phòng khi chưa có file MP3). */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Audio câu ví dụ (xem sentenceAudioUrl) dạng hàm để nút nghe gọi khi cần. */
export function sentenceAudio(senseId: string, index: number, voice: Voice, sentence: string) {
  return () => sentenceAudioUrl(senseId, index, voice, sentence);
}

/**
 * Nút nghe to cho tập nghe: tự phát một lần khi hiện ra (trừ khi tắt âm thanh), nghe lại bao nhiêu
 * lần cũng được (báo số lần qua `onReplay`), đổi tốc độ 1x/0.75x.
 */
export function ListenPlayer({
  text,
  voice,
  url,
  resolveUrl,
  autoPlay,
  onReplay,
}: {
  text: string;
  voice: Voice;
  url?: string | null;
  resolveUrl?: () => Promise<string | null>;
  autoPlay: boolean;
  onReplay?: (replays: number) => void;
}) {
  const t = useTranslations("review");
  const player = useMemo(() => createPlayer(browserPlayerEnv()), []);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [playing, setPlaying] = useState(false);
  const [replays, setReplays] = useState(0);
  // Câu ví dụ: xin URL một lần, các lần nghe lại dùng lại.
  const resolved = useRef<Promise<string | null> | null>(null);
  const resolveOnce = resolveUrl ? () => (resolved.current ??= resolveUrl()) : undefined;

  async function play(speed: PlaybackRate) {
    setPlaying(true);
    const result = await player.play({
      url,
      resolveUrl: resolveOnce,
      text,
      voice,
      rate: speed,
      onEnd: () => setPlaying(false),
    });
    if (result === "none") setPlaying(false);
  }

  useEffect(() => () => player.stop(), [player]);

  useEffect(() => {
    if (autoPlay) {
      void player.play({ url, resolveUrl: resolveOnce, text, voice, rate: 1, onEnd: () => {} });
    }
    // Chỉ phát khi câu hiện ra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function replay() {
    const count = replays + 1;
    setReplays(count);
    onReplay?.(count);
    void play(rate);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={replay}
          aria-label={t("listen")}
          data-playing={playing}
          className={cn(
            "flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            playing && "animate-pulse",
          )}
        >
          <Volume2 className="size-9" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setRate(rate === 1 ? 0.75 : 1)}
          aria-label={t("listenRate", { rate })}
          aria-pressed={rate === 0.75}
          className="flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:text-primary"
        >
          {rate === 1 ? "1x" : "0.75x"}
        </button>
      </div>
      <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
        {replays > 0 && t("replays", { count: replays })}
      </p>
    </div>
  );
}
