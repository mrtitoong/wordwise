"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LevelMeter, MicErrorHelp, MicExplainSheet } from "@/features/voice/mic-ui";
import { blobToWavBase64 } from "@/features/voice/recorder";
import { useRecorder } from "@/features/voice/use-recorder";
import { browserPlayerEnv, createPlayer } from "@/lib/audio/player";
import { pinyinOfSense, zhCardInfo } from "@/lib/lang/zh/card";
import type { PronunciationLocale, PronunciationResult } from "@/lib/pronunciation/api";
import { BAND_SYMBOL, type ScoreBand } from "@/lib/pronunciation/feedback";
import { requestAssessment } from "@/lib/pronunciation/request";
import { zhBand, zhSyllables, zhTips } from "@/lib/pronunciation/zh-feedback";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { e2eAnswer } from "../e2e";
import type { ModeProps } from "./types";
import { WordHead } from "./word-face";

type Problem = "noSpeech" | "login" | "limit" | "unavailable";

const BAND_TONE: Record<ScoreBand, string> = {
  good: "border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
  fair: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  poor: "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
};

/**
 * Tập phát âm không tính lịch ôn (tiếng Trung, chốt Z4): nghe mẫu, đọc, xem mức phụ âm và vần của từng
 * chữ, nghe lại và so với mẫu. Chưa chấm thanh điệu; đọc xong sang câu sau không ghi lượt ôn.
 */
export function SpeakPractice({
  item,
  voice,
  muted,
  locale,
  onNext,
}: Omit<ModeProps, "onAnswer"> & { locale: PronunciationLocale; onNext: () => void }) {
  const t = useTranslations("review.speak");
  const tz = useTranslations("review.speakZh");
  const { state, levels, start, confirm, stop, reset } = useRecorder();
  const [scoring, setScoring] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const scored = useRef<string | null>(null);
  const player = useMemo(() => createPlayer(browserPlayerEnv()), []);
  const { content, media } = item.word;
  const lemma = content.lemma;
  const language = content.language;
  const sample = media.audio[voice];
  const recording = state.status === "recording";
  const mine = state.status === "done" ? state.recording.url : null;
  const zh = zhCardInfo(content);
  const pinyin = zh ? pinyinOfSense(zh, item.senseIndex) : "";

  useEffect(() => () => player.stop(), [player]);

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
        if (response.status === "ok") setResult(response.result);
        else {
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
  }, [state, lemma, locale]);

  function compare() {
    if (!mine) return;
    player.stop();
    void player.play({
      url: mine,
      text: lemma,
      voice,
      language,
      rate: 1,
      onEnd: () => void player.play({ url: sample, text: lemma, voice, language, rate: 1 }),
    });
  }

  const band = result ? zhBand(result) : null;
  const syllables = result ? zhSyllables(result, lemma, pinyin) : null;
  const tips = syllables ? zhTips(syllables) : [];

  return (
    <div className="flex flex-1 flex-col gap-4" {...e2eAnswer(lemma)}>
      <p className="text-center text-sm text-muted-foreground">{t("prompt")}</p>
      <WordHead item={item} voice={voice} autoPlay={!muted} />
      <p className="rounded-xl bg-muted/60 p-3 text-center text-sm">{tz("noTones")}</p>

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
            <p className="text-2xl font-bold">
              <span aria-hidden>{BAND_SYMBOL[band]} </span>
              {tz(`band.${band}`)}
            </p>
            <p className="text-sm">{tz("bandHint")}</p>
          </div>

          {syllables && (
            <ul className="flex flex-wrap justify-center gap-1" aria-label={tz("syllables")}>
              {syllables.map((syllable, index) => (
                <li
                  key={index}
                  className={cn(
                    "flex min-w-14 flex-col items-center rounded-lg border-2 px-2 py-1",
                    BAND_TONE[syllable.band],
                  )}
                >
                  <span className="text-xl" lang={language}>
                    {syllable.text}
                  </span>
                  <span className="text-xs" lang="zh-Latn">
                    {syllable.pinyin}
                  </span>
                  <span className="text-xs">
                    <span aria-hidden>{BAND_SYMBOL[syllable.band]} </span>
                    {tz(`band.${syllable.band}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tips.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm" aria-label={t("tipsTitle")}>
              {tips.map((tip) => (
                <li key={tip.key} className="rounded-xl bg-muted/60 p-3">
                  <span className="font-semibold" lang="zh-Latn">
                    {tip.pinyin}
                  </span>{" "}
                  {tz(`tips.${tip.key}`)}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!mine}
              onClick={() =>
                mine && void player.play({ url: mine, text: lemma, voice, language, rate: 1 })
              }
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
        </section>
      )}

      <Button className="mt-auto min-h-12" variant={result ? "default" : "ghost"} onClick={onNext}>
        {t(result ? "next" : "skip")}
      </Button>

      <MicExplainSheet open={state.status === "explain"} onAllow={confirm} onCancel={reset} />
    </div>
  );
}
