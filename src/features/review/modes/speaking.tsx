"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LevelMeter, MicErrorHelp, MicExplainSheet } from "@/features/voice/mic-ui";
import { blobToWavBase64 } from "@/features/voice/recorder";
import { useRecorder } from "@/features/voice/use-recorder";
import { browserPlayerEnv, createPlayer } from "@/lib/audio/player";
import type { PronunciationLocale, PronunciationResult } from "@/lib/pronunciation/api";
import {
  BAND_SYMBOL,
  hasPhonemeNames,
  pronunciationTips,
  scoreBand,
  type ScoreBand,
} from "@/lib/pronunciation/feedback";
import { requestAssessment } from "@/lib/pronunciation/request";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { e2eAnswer } from "../e2e";
import type { ModeProps } from "./types";
import { WordHead } from "./word-face";

/** Lỗi chấm hiện cho người học (khóa trong review.speak.problem.*). */
type Problem = "noSpeech" | "login" | "limit" | "unavailable";

const BAND_TONE: Record<ScoreBand, string> = {
  good: "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  fair: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  poor: "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

/**
 * Tập phát âm (Prompt 5.3): nghe mẫu (thường/chậm) → bấm micro đọc to → điểm 0–100, các âm tô màu
 * kèm ký hiệu, mẹo sửa âm cho người Việt; nghe lại bản của mình và so với mẫu. Lần chấm đầu tiên
 * dùng để xếp lịch (đọc lại chỉ để luyện). Không chấm được (khách, hết lượt, lỗi) thì bỏ qua câu.
 */
export function Speaking({
  item,
  voice,
  muted,
  onAnswer,
  onSkip,
  locale,
}: ModeProps & { onSkip: () => void; locale: PronunciationLocale }) {
  const t = useTranslations("review.speak");
  const tTips = useTranslations("review.tips");
  const { state, levels, start, confirm, stop, reset } = useRecorder();
  const [shownAt] = useState(() => Date.now());
  const [scoring, setScoring] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [first, setFirst] = useState<{ score: number; ms: number } | null>(null);
  const scored = useRef<string | null>(null);
  const player = useMemo(() => createPlayer(browserPlayerEnv()), []);
  const lemma = item.word.content.lemma;
  const sample = item.word.media.audio[voice];
  const recording = state.status === "recording";
  const mine = state.status === "done" ? state.recording.url : null;

  useEffect(() => () => player.stop(), [player]);

  // Thu xong thì gửi chấm (mỗi bản thu một lần).
  useEffect(() => {
    if (state.status !== "done" || scored.current === state.recording.url) return;
    const { url, blob, heardSpeech } = state.recording;
    scored.current = url;
    void (async () => {
      setScoring(true);
      setProblem(null);
      try {
        const audio = heardSpeech ? await blobToWavBase64(blob) : null;
        if (!audio) return setProblem("noSpeech");
        if (!getSupabaseEnv()) return setProblem("unavailable");
        const response = await requestAssessment(createClient(), { text: lemma, locale, audio });
        if (response.status === "ok") {
          setResult(response.result);
          setFirst((f) => f ?? { score: response.result.overall, ms: Date.now() - shownAt });
        } else {
          setProblem(
            response.status === "no_speech"
              ? "noSpeech"
              : response.status === "login_required"
                ? "login"
                : response.status === "limit_reached"
                  ? "limit"
                  : "unavailable",
          );
        }
      } catch {
        setProblem("unavailable");
      } finally {
        setScoring(false);
      }
    })();
  }, [state, lemma, locale, shownAt]);

  function next() {
    if (!first) return;
    onAnswer({
      correct: first.score >= 60,
      responseMs: first.ms,
      pronunciationScore: first.score,
    });
  }

  /** Nghe bản của mình rồi tới bản mẫu. */
  function compare() {
    if (!mine) return;
    player.stop();
    void player.play({
      url: mine,
      text: lemma,
      voice,
      rate: 1,
      onEnd: () => void player.play({ url: sample, text: lemma, voice, rate: 1 }),
    });
  }

  const band = result ? scoreBand(result.overall) : null;
  const tips = result ? pronunciationTips(result) : [];
  const canSkip = !first;

  return (
    <div className="flex flex-1 flex-col gap-4" {...e2eAnswer(lemma)}>
      <p className="text-center text-sm text-muted-foreground">{t("prompt")}</p>
      <WordHead item={item} voice={voice} autoPlay={!muted} />

      {!result && (
        <div className="flex flex-col items-center gap-2">
          <LevelMeter levels={levels} active={recording} />
          <button
            type="button"
            onClick={recording ? stop : start}
            disabled={scoring || state.status === "requesting"}
            aria-label={t(recording ? "stop" : "record")}
            className={cn(
              "flex size-20 items-center justify-center rounded-full text-primary-foreground shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
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
            {scoring ? t("scoring") : recording ? t("recording") : t("tapToRecord")}
          </p>
        </div>
      )}

      {state.status === "error" && <MicErrorHelp error={state.error} />}
      {problem && (
        <p role="alert" className="rounded-xl border border-amber-300 p-3 text-sm">
          {t(`problem.${problem}`)}
        </p>
      )}

      {result && band && (
        <section className="flex flex-col gap-3" aria-live="polite">
          <div
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl border-2 p-4 text-center",
              BAND_TONE[band],
            )}
          >
            <p className="text-4xl font-bold tabular-nums">
              <span aria-hidden>{BAND_SYMBOL[band]} </span>
              {t("score", { score: Math.round(result.overall) })}
            </p>
            <p className="font-medium">{t(`band.${band}`)}</p>
            {first && first.score !== result.overall && (
              <p className="text-xs">{t("firstScore", { score: Math.round(first.score) })}</p>
            )}
          </div>

          {hasPhonemeNames(result) ? (
            <ul
              className="flex flex-wrap justify-center gap-1"
              aria-label={t("phonemes")}
              lang="en"
            >
              {result.words.flatMap((word, w) =>
                word.phonemes.map((phoneme, p) => {
                  const b = scoreBand(phoneme.score);
                  return (
                    <li
                      key={`${w}-${p}`}
                      className={cn(
                        "flex min-w-11 flex-col items-center rounded-lg border-2 px-2 py-1",
                        BAND_TONE[b],
                      )}
                    >
                      <span className="font-mono text-lg">/{phoneme.ipa}/</span>
                      <span className="text-xs tabular-nums">
                        <span aria-hidden>{BAND_SYMBOL[b]} </span>
                        {Math.round(phoneme.score)}
                      </span>
                    </li>
                  );
                }),
              )}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted-foreground">{t("noPhonemes")}</p>
          )}

          {tips.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm" aria-label={t("tipsTitle")}>
              {tips.map((tip) => (
                <li key={tip.key} className="rounded-xl bg-muted/60 p-3">
                  <span className="font-mono font-semibold" lang="en">
                    /{tip.phoneme}/
                  </span>{" "}
                  {tTips(tip.key)}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!mine}
              onClick={() => mine && void player.play({ url: mine, text: lemma, voice, rate: 1 })}
            >
              {t("playMine")}
            </Button>
            <Button variant="outline" className="min-h-11" disabled={!mine} onClick={compare}>
              {t("compare")}
            </Button>
          </div>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              setResult(null);
              reset();
            }}
          >
            {t("again")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("disclaimer")}</p>
          <Button className="min-h-12" onClick={next}>
            {t("next")}
          </Button>
        </section>
      )}

      {/* Đọc lại sau khi đã có điểm lần đầu: lỗi hay chưa đọc vẫn sang câu sau được. */}
      {!result && first && (
        <Button className="min-h-12" onClick={next}>
          {t("next")}
        </Button>
      )}

      {!result && canSkip && (problem || state.status === "error") && (
        <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={onSkip}>
          {t("skip")}
        </Button>
      )}

      <MicExplainSheet open={state.status === "explain"} onAllow={confirm} onCancel={reset} />
    </div>
  );
}
