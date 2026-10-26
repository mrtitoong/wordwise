"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import { Button } from "@/components/ui/button";
import {
  answersForWord,
  checkAnswer,
  type CheckOptions,
  type CheckResult,
} from "@/lib/grading/spelling";
import type { MasteryLevel } from "@/lib/srs/mastery";
import {
  MAX_HINT_LEVEL,
  assemble,
  clozeOf,
  maskedPositions,
  maxRatingFor,
  nextTileIndex,
  patternOf,
  promptKind,
  scrambleTiles,
  slotsOf,
  startLevel,
  type Cloze,
  type WritingLevel,
} from "@/lib/review/writing";
import { cn } from "@/lib/utils";
import { replaysAsHint } from "@/lib/review/listening";
import { applyKey, type KeyboardKey } from "@/lib/review/keyboard";
import type { PreparedCard } from "../session-content";
import { e2eAnswer } from "../e2e";
import {
  AnswerDisplay,
  LetterKeyboard,
  useLetterKeyboard,
  usePhysicalKeys,
} from "./letter-keyboard";
import { ListenPlayer, sentenceAudio } from "./listen-player";
import type { ModeProps } from "./types";

/** Câu hỏi tập viết (chọn một lần khi câu hiện ra). */
export type WritingTask = {
  level: WritingLevel;
  prompt:
    | { kind: "meaning" }
    | { kind: "cloze"; cloze: Cloze; translation: string }
    /** Tập nghe: nghe từ rồi gõ lại. */
    | { kind: "listen" }
    /** Tập nghe: nghe câu ví dụ rồi điền từ còn thiếu. */
    | { kind: "listen-cloze"; cloze: Cloze };
  target: string;
  options: CheckOptions;
  /** Cấp 1: ô chữ cái đã xáo. */
  tiles: string[];
  /** Cấp 2: vị trí chữ bị che. */
  masked: Set<number>;
};

export function buildWritingTask(
  item: PreparedCard,
  mastery: MasteryLevel,
  random: () => number = Math.random,
): WritingTask {
  const cloze = clozeOfItem(item);
  const kind = promptKind(mastery, !!cloze, random);
  const { target, options } = answersForWord(
    item.word.content,
    kind === "cloze" ? cloze!.answer : undefined,
  );
  return {
    level: startLevel(mastery, random),
    prompt:
      kind === "cloze"
        ? { kind, cloze: cloze!, translation: item.example!.translation_vi }
        : { kind: "meaning" },
    target,
    options,
    tiles: scrambleTiles(target, random),
    masked: maskedPositions(target, random),
  };
}

/** Câu ví dụ của thẻ khuyết được từ (để hỏi điền từ). */
export function clozeOfItem(item: PreparedCard): Cloze | null {
  return item.example ? clozeOf(item.example.sentence, item.example.highlight) : null;
}

/**
 * Tập nghe dạng gõ (Prompt 4.3): nghe từ → gõ lại, hoặc nghe câu → điền từ. Bắt đầu ở ô trống;
 * "Gợi ý" vẫn hạ cấp như tập viết.
 */
export function buildListeningTask(
  item: PreparedCard,
  kind: "listen" | "listen-cloze",
  random: () => number = Math.random,
): WritingTask {
  const cloze = kind === "listen-cloze" ? clozeOfItem(item) : null;
  const { target, options } = answersForWord(item.word.content, cloze?.answer);
  return {
    level: 4,
    prompt: cloze ? { kind: "listen-cloze", cloze } : { kind: "listen" },
    target,
    options,
    tiles: scrambleTiles(target, random),
    masked: maskedPositions(target, random),
  };
}

const PROMPT_TITLE = {
  meaning: "writeWord",
  cloze: "writeCloze",
  listen: "listenType",
  "listen-cloze": "listenCloze",
} as const;

/** Đúng (không lỗi) thì tự chuyển câu sau chừng này ms. */
const AUTO_NEXT_MS = 1200;

const INPUT_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  enterKeyHint: "done",
  lang: "en",
} as const;

/**
 * Tập viết 4 cấp: 1 xếp chữ · 2 điền chữ thiếu · 3 chữ đầu + số ô · 4 ô trống. "Gợi ý" hạ một
 * cấp (ở cấp 1: đặt sẵn chữ kế tiếp). Sau khi kiểm tra: tô màu từng chữ, phát âm, sai thì gõ lại.
 */
export function Writing({ item, voice, muted, onAnswer, task }: ModeProps & { task: WritingTask }) {
  const t = useTranslations("review");
  const tw = useTranslations("wordCard");
  const [shownAt] = useState(() => Date.now());
  const [level, setLevel] = useState<WritingLevel>(task.level);
  const [hints, setHints] = useState(0);
  const [replays, setReplays] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<(CheckResult & { ms: number; revealed: boolean }) | null>(
    null,
  );
  const [retry, setRetry] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const answered = useRef(false);
  // Điện thoại: bàn phím chữ cái của app (không có thanh gợi ý, không bị bộ gõ tiếng Việt đổi chữ).
  const letterKeyboard = useLetterKeyboard();
  const letterCount = slotsOf(task.target).filter((s) => !s.fixed).length;

  function check(answer: string, revealed = false) {
    if (result) return;
    const checked = checkAnswer(answer, task.target, {
      ...task.options,
      // Xếp chữ không có lỗi gõ: đổi chỗ 2 ô là sai thứ tự, không phải gõ nhầm.
      allowTypo: level !== 1 && task.options.allowTypo !== false,
    });
    setResult({
      ...checked,
      correct: checked.correct && !revealed,
      ms: Date.now() - shownAt,
      revealed,
    });
  }

  function next() {
    if (!result || answered.current) return;
    answered.current = true;
    onAnswer({
      correct: result.correct,
      responseMs: result.ms,
      revealed: result.revealed,
      typoCount: result.correct ? result.typoCount : undefined,
      usedHint: hints > 0 || replaysAsHint(replays),
      hintLevel: Math.min(MAX_HINT_LEVEL, hints + (replaysAsHint(replays) ? 1 : 0)),
      maxRating: maxRatingFor(level),
    });
  }

  function typeAnswer(key: KeyboardKey) {
    if (key.kind === "submit") {
      if (text.trim()) check(text);
    } else {
      setText((current) => applyKey(current, key));
    }
  }

  function typeRetry(key: KeyboardKey) {
    if (key.kind === "submit") next();
    else setRetry((current) => applyKey(current, key));
  }

  // Bàn phím vật lý khi đang dùng bàn phím của app. Enter sau khi trả lời do effect bên dưới xử lý.
  usePhysicalKeys(letterKeyboard && level > 1 && !result?.correct, (key) => {
    if (!result) typeAnswer(key);
    else if (key.kind !== "submit") typeRetry(key);
  });

  function hint() {
    if (result) return;
    setHints((h) => h + 1);
    if (level > 1) {
      setLevel((l) => (l - 1) as WritingLevel);
      return;
    }
    let current = placed;
    // Đặt sai thì gỡ phần sai trước rồi mới đặt chữ kế tiếp.
    while (current.length && nextTileIndex(task.target, task.tiles, current) < 0) {
      current = current.slice(0, -1);
    }
    const index = nextTileIndex(task.target, task.tiles, current);
    place(index >= 0 ? [...current, index] : current);
  }

  function place(next: number[]) {
    setPlaced(next);
    if (next.length === letterCount) {
      check(
        assemble(
          task.target,
          next.map((i) => task.tiles[i]!),
        ),
      );
    }
  }

  // Đúng không lỗi thì tự sang câu sau.
  useEffect(() => {
    if (!result?.correct || result.typoCount > 0) return;
    const timer = setTimeout(next, AUTO_NEXT_MS);
    return () => clearTimeout(timer);
  });

  // Cấp 1 trên máy tính: gõ phím chữ để chọn ô, Backspace gỡ ô cuối; Enter để tiếp.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      if (result) {
        if (event.key === "Enter" && !(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
          next();
        }
        return;
      }
      if (level !== 1 || event.target instanceof HTMLInputElement) return;
      if (event.key === "Backspace") {
        event.preventDefault();
        setPlaced((p) => p.slice(0, -1));
      } else if (event.key.length === 1) {
        const index = task.tiles.findIndex(
          (tile, i) => tile === event.key.toLowerCase() && !placed.includes(i),
        );
        if (index >= 0) place([...placed, index]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (level > 1 && !result && !letterKeyboard) input.current?.focus();
  }, [level, result, letterKeyboard]);

  const hintRow = (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" className="min-h-11" onClick={hint}>
        <Lightbulb className="size-4" aria-hidden />
        {t("hint")}
      </Button>
      <Button
        variant="ghost"
        className="min-h-11 text-muted-foreground"
        onClick={() => check(level === 1 ? "" : text, true)}
      >
        {t("dontKnow")}
      </Button>
    </div>
  );

  const lemma = item.word.content.lemma;
  const { prompt } = task;
  const cloze = prompt.kind === "cloze" || prompt.kind === "listen-cloze" ? prompt.cloze : null;
  const sentence = cloze ? item.example!.sentence : null;
  const sentenceUrl = sentence ? sentenceAudio(item.senseId, 0, voice) : undefined;

  return (
    <div className="flex flex-1 flex-col gap-4" {...e2eAnswer(task.target)}>
      <p className="text-center text-sm text-muted-foreground">{t(PROMPT_TITLE[prompt.kind])}</p>

      {(prompt.kind === "listen" || prompt.kind === "listen-cloze") && !result && (
        <ListenPlayer
          text={sentence ?? lemma}
          voice={voice}
          url={sentence ? null : item.word.media.audio[voice]}
          resolveUrl={sentenceUrl}
          autoPlay={!muted}
          onReplay={setReplays}
        />
      )}

      {prompt.kind === "listen" ? null : cloze ? (
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 p-4 text-center">
          <p className="text-lg" lang="en">
            {cloze.before}
            <span className="mx-1 inline-block min-w-16 border-b-2 border-foreground align-baseline">
              {result ? (
                <strong className="font-semibold">{cloze.answer}</strong>
              ) : (
                <span className="sr-only">{t("blank")}</span>
              )}
            </span>
            {cloze.after}
          </p>
          {prompt.kind === "cloze" && (
            <p className="text-sm text-muted-foreground">{prompt.translation}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-2xl font-semibold">{item.meaning}</p>
          <p className="text-sm text-muted-foreground">{tw(`pos.${item.word.content.pos}`)}</p>
        </div>
      )}

      {!result && level === 1 && (
        <Tiles
          target={task.target}
          tiles={task.tiles}
          placed={placed}
          onPlace={(i) => place([...placed, i])}
          onRemove={(k) => setPlaced(placed.filter((_, j) => j !== k))}
          onClear={() => setPlaced([])}
        />
      )}

      {!result && level > 1 && letterKeyboard && (
        <div className="flex flex-1 flex-col gap-3">
          {(level === 2 || level === 3) && (
            <Pattern pattern={patternOf(task.target, level, task.masked)} />
          )}
          <AnswerDisplay value={text} label={t("answerInput")} placeholder={t("typeHere")} />
          {hintRow}
          {/* Sát đáy màn hình như bàn phím hệ thống (dễ bấm bằng ngón cái). */}
          <div className="mt-auto">
            <LetterKeyboard
              onKey={typeAnswer}
              submitLabel={t("check")}
              submitDisabled={!text.trim()}
            />
          </div>
        </div>
      )}

      {!result && level > 1 && !letterKeyboard && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) check(text);
          }}
        >
          {(level === 2 || level === 3) && (
            <Pattern pattern={patternOf(task.target, level, task.masked)} />
          )}
          <input
            ref={input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={t("answerInput")}
            placeholder={t("typeHere")}
            className="min-h-12 rounded-xl border-2 bg-background px-4 text-center text-xl focus-visible:border-primary focus-visible:outline-none"
            {...INPUT_PROPS}
          />
          <Button type="submit" className="min-h-12" disabled={!text.trim()}>
            {t("check")}
          </Button>
        </form>
      )}

      {!result && !(letterKeyboard && level > 1) && hintRow}

      {result && (
        <div className={cn("flex flex-col gap-3", letterKeyboard && !result.correct && "flex-1")}>
          <p
            role="status"
            className={cn(
              "text-center font-semibold",
              result.correct
                ? "text-green-700 dark:text-green-300"
                : "text-red-700 dark:text-red-300",
            )}
          >
            {t(
              result.revealed
                ? "revealed"
                : result.correct
                  ? result.typoCount > 0
                    ? "rightTypo"
                    : "right"
                  : result.reason === "wrong_form"
                    ? "wrongForm"
                    : "wrong",
            )}
          </p>
          {!result.revealed && result.typoCount > 0 && <Diff diff={result.diff} />}
          <div className="flex flex-col items-center gap-1">
            <p className="text-3xl font-bold break-words" lang="en">
              {result.matched}
            </p>
            <AudioButton
              text={sentence ?? lemma}
              voice={voice}
              url={sentence ? null : item.word.media.audio[voice]}
              resolveUrl={sentenceUrl}
              autoPlay={!muted}
              showRate
            />
          </div>
          {!result.correct && letterKeyboard && (
            <div className="flex flex-1 flex-col gap-2 text-sm">
              <span className="text-muted-foreground">{t("retype")}</span>
              <div className="relative">
                <AnswerDisplay value={retry} label={t("retype")} className="text-lg" />
                {checkAnswer(retry, result.matched, { allowTypo: false }).correct && (
                  <Check
                    className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-green-700"
                    aria-label={t("right")}
                  />
                )}
              </div>
              <div className="mt-auto pt-2">
                <LetterKeyboard onKey={typeRetry} submitLabel={t("next")} />
              </div>
            </div>
          )}
          {!result.correct && !letterKeyboard && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t("retype")}</span>
              <span className="relative">
                <input
                  value={retry}
                  onChange={(event) => setRetry(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      next();
                    }
                  }}
                  className="min-h-12 w-full rounded-xl border-2 bg-background px-4 text-center text-lg focus-visible:border-primary focus-visible:outline-none"
                  {...INPUT_PROPS}
                />
                {checkAnswer(retry, result.matched, { allowTypo: false }).correct && (
                  <Check
                    className="absolute top-1/2 right-3 size-5 -translate-y-1/2 text-green-700"
                    aria-label={t("right")}
                  />
                )}
              </span>
            </label>
          )}
          {!(letterKeyboard && !result.correct) && (
            <Button className="min-h-12" onClick={next}>
              {t("next")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Cấp 1: hàng ô trả lời (chạm để gỡ) và các ô chữ cái (chạm để đặt). */
function Tiles({
  target,
  tiles,
  placed,
  onPlace,
  onRemove,
  onClear,
}: {
  target: string;
  tiles: readonly string[];
  placed: readonly number[];
  onPlace: (index: number) => void;
  onRemove: (position: number) => void;
  onClear: () => void;
}) {
  const t = useTranslations("review");
  let k = 0;
  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap justify-center gap-1"
        aria-label={t("answerInput")}
        role="group"
        lang="en"
      >
        {slotsOf(target).map((slot, i) => {
          if (slot.fixed) return <span key={i} className="w-3" aria-hidden />;
          const position = k++;
          const tile = placed[position];
          return tile === undefined ? (
            <span
              key={i}
              className="flex size-11 items-center justify-center rounded-lg border-2 border-dashed"
              aria-hidden
            />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onRemove(position)}
              aria-label={t("removeLetter", { letter: tiles[tile]! })}
              className="flex size-11 items-center justify-center rounded-lg border-2 border-primary bg-accent text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring"
            >
              {tiles[tile]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={t("letters")}>
        {tiles.map((tile, i) => {
          const used = placed.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={used}
              onClick={() => onPlace(i)}
              lang="en"
              className={cn(
                "flex size-12 items-center justify-center rounded-xl border-2 bg-card text-xl font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-ring",
                used && "invisible",
              )}
            >
              {tile}
            </button>
          );
        })}
      </div>
      {placed.length > 0 && (
        <Button variant="ghost" className="min-h-11 self-center" onClick={onClear}>
          <Undo2 className="size-4" aria-hidden />
          {t("clear")}
        </Button>
      )}
    </div>
  );
}

/** Mẫu cấp 2–3: chữ hiện sẵn và ô trống. */
function Pattern({ pattern }: { pattern: readonly (string | null)[] }) {
  const t = useTranslations("review");
  return (
    <p
      className="flex flex-wrap justify-center gap-1 font-mono text-2xl"
      lang="en"
      aria-label={t("pattern", {
        pattern: pattern.map((c) => (c === null ? "_" : c)).join(""),
      })}
    >
      {pattern.map((c, i) =>
        c === " " ? (
          <span key={i} className="w-3" aria-hidden />
        ) : (
          <span
            key={i}
            aria-hidden
            className={cn(
              "flex h-10 w-7 items-end justify-center border-b-2",
              c === null ? "border-foreground" : "border-transparent",
            )}
          >
            {c ?? ""}
          </span>
        ),
      )}
    </p>
  );
}

/** Tô màu từng chữ: thay/thừa đỏ, thiếu xanh, đổi chỗ vàng. */
function Diff({ diff }: { diff: CheckResult["diff"] }) {
  const t = useTranslations("review");
  return (
    <p className="text-center font-mono text-xl" lang="en" aria-label={t("diffLabel")}>
      {diff.map((part, i) =>
        part.op === "equal" ? (
          <span key={i}>{part.expected}</span>
        ) : part.op === "missing" ? (
          <span key={i} className="text-green-700 underline dark:text-green-300">
            {part.expected}
          </span>
        ) : part.op === "extra" ? (
          <span key={i} className="text-red-700 line-through dark:text-red-300">
            {part.input}
          </span>
        ) : part.op === "swap" ? (
          <span key={i} className="text-amber-700 underline dark:text-amber-300">
            {part.expected}
          </span>
        ) : (
          <span key={i} className="text-red-700 underline dark:text-red-300">
            {part.expected}
          </span>
        ),
      )}
    </p>
  );
}
