"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Loader2, Mic, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import type { SpeechLang } from "@/lib/voice/api";
import { recognitionLang, splitUtterance } from "@/lib/voice/candidates";
import { reverseLookup } from "@/lib/words/request-word";
import type { ReverseResponse } from "@/lib/words/reverse";
import {
  createRecognizer,
  hasBrowserRecognition,
  hasRecorder,
  type Recognizer,
  type RecognizerError,
} from "@/features/voice/recognizer";
import type { EntryContext } from "./add-word-screen";
import { BulkEntry } from "./bulk-entry";
import { SingleEntry } from "./single-entry";
import { radioGroupKeys } from "@/components/ui/radio-keys";

/** Giữ nút lâu hơn mức này thì thả ra là dừng (bấm giữ); ngắn hơn là chạm (tự dừng khi im). */
const HOLD_MS = 400;

type Phase = "idle" | "listening" | "processing";
type Mode = "learn" | "reverse";

/** Tab Nói: giữ micro để nói → chọn phương án → thêm như tab Gõ (cách nhập "voice"). */
export function VoiceEntry({
  context,
  onTypeInstead,
}: {
  context: EntryContext;
  onTypeInstead: () => void;
}) {
  const t = useTranslations("addWord.voice");
  const ta = useTranslations("wordCard");
  const [mode, setMode] = useState<Mode>("learn");
  const [continuous, setContinuous] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<RecognizerError | "unsupported" | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [reverse, setReverse] = useState<{
    query: string;
    response: ReverseResponse | null;
  } | null>(null);
  // Tab chỉ hiện sau khi đọc xong dữ liệu trong máy (đã ở trình duyệt), nên kiểm tra ngay được.
  const [supported] = useState(() => ({
    browser: hasBrowserRecognition(),
    recorder: hasRecorder(),
  }));
  const recognizer = useRef<Recognizer | null>(null);
  const downAt = useRef(0);

  useEffect(() => () => recognizer.current?.abort(), []);

  const lang: SpeechLang = recognitionLang(mode, context.accent) as SpeechLang;
  const canContinuous = mode === "learn" && supported.browser;

  async function lookupReverse(query: string) {
    setReverse({ query, response: null });
    if (!getSupabaseEnv()) {
      setError("unavailable");
      return;
    }
    try {
      setReverse({ query, response: await reverseLookup(createClient(), query) });
    } catch {
      setReverse(null);
      setError("network");
    }
  }

  function start() {
    setError(null);
    setCandidates([]);
    setReverse(null);
    const instance = createRecognizer(lang, continuous && canContinuous, {
      onResult: (alternatives) => {
        if (mode === "reverse") void lookupReverse(alternatives[0]!);
        else if (continuous && canContinuous) {
          setLines((prev) => [
            ...prev,
            ...splitUtterance(alternatives[0]!).filter((w) => !prev.includes(w)),
          ]);
        } else setCandidates(alternatives);
      },
      onError: (e) => setError(e),
      onProcessing: () => setPhase("processing"),
      onEnd: () => setPhase("idle"),
    });
    if (!instance) {
      setError("unsupported");
      return;
    }
    recognizer.current = instance;
    setPhase("listening");
    instance.start();
  }

  function stop() {
    recognizer.current?.stop();
  }

  function onPointerDown() {
    if (phase === "listening") {
      stop();
      return;
    }
    if (phase !== "idle") return;
    downAt.current = Date.now();
    start();
  }

  function onPointerUp() {
    if (phase === "listening" && Date.now() - downAt.current >= HOLD_MS) stop();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (phase === "listening") stop();
    else if (phase === "idle") start();
  }

  if (chosen) {
    return (
      <div className="flex flex-col gap-3">
        <SingleEntry
          key={chosen}
          context={context}
          prefill={chosen}
          inputMethod="voice"
          onPasteList={() => {}}
        />
        <Button variant="outline" className="min-h-11" onClick={() => setChosen(null)}>
          <Mic aria-hidden />
          {t("again")}
        </Button>
      </div>
    );
  }

  if (review) {
    return (
      <BulkEntry
        text={lines.join("\n")}
        context={context}
        inputMethod="voice"
        onDone={() => {
          setReview(false);
          setLines([]);
        }}
      />
    );
  }

  const unsupported = !supported.browser && !supported.recorder;
  const label =
    phase === "processing"
      ? t("processing")
      : phase === "listening"
        ? t("tapToStop")
        : t("holdToTalk");

  return (
    <section className="flex flex-col gap-4">
      <div
        role="radiogroup"
        onKeyDown={radioGroupKeys}
        aria-label={t("modeLabel")}
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(["learn", "reverse"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={phase !== "idle"}
            onClick={() => {
              setMode(m);
              setCandidates([]);
              setReverse(null);
              setError(null);
            }}
            className={cn(
              "min-h-11 rounded-lg px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring",
              mode === m ? "bg-background font-semibold shadow-sm" : "text-muted-foreground",
            )}
          >
            {t(m)}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {t(mode === "learn" ? "hintLearn" : "hintReverse")}
      </p>

      <div className="flex flex-col items-center gap-3 py-2">
        <button
          type="button"
          aria-label={t("micLabel")}
          aria-pressed={phase === "listening"}
          disabled={!!unsupported || phase === "processing"}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            "relative flex size-24 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-50",
            phase === "listening" && "scale-110 bg-destructive shadow-destructive/30",
          )}
        >
          {phase === "listening" && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-destructive/40"
              aria-hidden
            />
          )}
          {phase === "processing" ? (
            <Loader2 className="size-10 animate-spin" aria-hidden />
          ) : (
            <Mic className="relative size-10" aria-hidden />
          )}
        </button>
        <p className="text-sm font-medium" role="status" aria-live="polite">
          {label}
        </p>
      </div>

      {canContinuous && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={continuous}
            disabled={phase !== "idle"}
            onChange={(e) => setContinuous(e.target.checked)}
            className="size-5 accent-primary"
          />
          {t("continuous")}
        </label>
      )}

      {(error || unsupported) && (
        <div className="flex flex-col items-start gap-2 rounded-xl bg-muted p-3" role="alert">
          <p className="text-sm">{t(`errors.${unsupported ? "unsupported" : error!}`)}</p>
          <div className="flex flex-wrap gap-2">
            {error === "login-required" && (
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/login?next=%2Fadd">{t("signIn")}</Link>
              </Button>
            )}
            <Button variant="outline" className="min-h-11" onClick={onTypeInstead}>
              {t("typeInstead")}
            </Button>
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("youSaid")}</h2>
          <ul aria-label={t("candidates")} className="flex flex-col gap-2">
            {candidates.map((c, i) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setChosen(c)}
                  className={cn(
                    "flex min-h-14 w-full items-center rounded-xl border px-4 text-left text-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                    i === 0 && "border-primary bg-accent/40 font-semibold",
                  )}
                  lang="en"
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reverse && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {t("youSaid")} <span className="font-semibold">“{reverse.query}”</span>
          </h2>
          {!reverse.response ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("searching")}
            </p>
          ) : reverse.response.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noSuggestions", { query: reverse.query })}
            </p>
          ) : (
            <ul aria-label={t("suggestions")} className="flex flex-col gap-2">
              {reverse.response.items.map((item) => (
                <li key={item.word}>
                  <button
                    type="button"
                    onClick={() => setChosen(item.word)}
                    className="flex min-h-14 w-full flex-col items-start gap-0.5 rounded-xl border px-4 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold" lang="en">
                        {item.word}
                      </span>
                      {item.pos && (
                        <span className="text-xs text-muted-foreground">
                          {ta(`posShort.${item.pos}`)}
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {t(item.source === "library" ? "fromLibrary" : "fromAi")}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.nuance ?? item.meaning}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {reverse.response &&
            ["login_required", "limit_reached", "unavailable"].includes(reverse.response.ai) && (
              <p className="text-xs text-muted-foreground">
                {t(
                  reverse.response.ai === "login_required"
                    ? "aiLogin"
                    : reverse.response.ai === "limit_reached"
                      ? "aiLimit"
                      : "aiUnavailable",
                )}
              </p>
            )}
        </section>
      )}

      {lines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("lines", { count: lines.length })}</h2>
          <ul className="flex flex-wrap gap-2">
            {lines.map((line) => (
              <li key={line}>
                <button
                  type="button"
                  aria-label={t("removeLine", { word: line })}
                  onClick={() => setLines(lines.filter((l) => l !== line))}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm hover:bg-muted"
                  lang="en"
                >
                  {line}
                  <X className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Button className="min-h-11" disabled={phase !== "idle"} onClick={() => setReview(true)}>
            {t("review", { count: lines.length })}
          </Button>
        </section>
      )}
    </section>
  );
}
