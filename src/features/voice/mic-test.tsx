"use client";

import { useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LevelMeter, MicErrorHelp, MicExplainSheet } from "./mic-ui";
import { blobToWavBase64 } from "./recorder";
import { useRecorder } from "./use-recorder";

/**
 * Kiểm tra micro (Cài đặt): thu thử tối đa 5 giây, nghe lại, xem định dạng và thử đổi sang WAV
 * 16 kHz như khi chấm phát âm. Dùng để kiểm thử trên từng trình duyệt (docs/qa/recording.md).
 */
export function MicTest() {
  const t = useTranslations("mic");
  const { state, levels, start, confirm, stop, reset, maxSeconds } = useRecorder();
  const [wav, setWav] = useState<{ forUrl: string; result: string } | null>(null);
  const recording = state.status === "recording";
  const done = state.status === "done" ? state.recording : null;

  async function checkWav() {
    if (!done) return;
    try {
      const base64 = await blobToWavBase64(done.blob);
      const kb = base64 ? Math.round((base64.length * 3) / 4 / 1024) : 0;
      setWav({ forUrl: done.url, result: base64 ? t("wavOk", { kb }) : t("wavSilent") });
    } catch {
      setWav({ forUrl: done.url, result: t("wavFailed") });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("testIntro", { seconds: maxSeconds })}</p>

      <div className="flex flex-col items-center gap-3 rounded-2xl border p-4">
        <LevelMeter levels={levels} active={recording} />
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={state.status === "requesting"}
          aria-label={t(recording ? "stop" : "record")}
          className={cn(
            "flex size-20 items-center justify-center rounded-full text-primary-foreground shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            recording ? "bg-red-600" : "bg-primary",
          )}
        >
          {recording ? (
            <Square className="size-8" aria-hidden />
          ) : (
            <Mic className="size-9" aria-hidden />
          )}
        </button>
        <p className="min-h-5 text-sm text-muted-foreground" role="status">
          {recording ? t("recordingHint") : state.status === "requesting" ? t("requesting") : ""}
        </p>
      </div>

      {state.status === "error" && <MicErrorHelp error={state.error} />}

      {done && (
        <section className="flex flex-col gap-2 rounded-2xl border p-4 text-sm" aria-live="polite">
          <h2 className="font-semibold">{t("resultTitle")}</h2>
          <audio controls src={done.url} className="w-full" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t("format")}</dt>
            <dd className="break-all">{done.mimeType}</dd>
            <dt className="text-muted-foreground">{t("duration")}</dt>
            <dd>{t("seconds", { value: (done.durationMs / 1000).toFixed(1) })}</dd>
            <dt className="text-muted-foreground">{t("speech")}</dt>
            <dd>{t(done.heardSpeech ? "speechYes" : "speechNo")}</dd>
            {wav?.forUrl === done.url && (
              <>
                <dt className="text-muted-foreground">WAV</dt>
                <dd>{wav.result}</dd>
              </>
            )}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => void checkWav()}>
              {t("checkWav")}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={reset}>
              {t("again")}
            </Button>
          </div>
        </section>
      )}

      <MicExplainSheet open={state.status === "explain"} onAllow={confirm} onCancel={reset} />
    </div>
  );
}
