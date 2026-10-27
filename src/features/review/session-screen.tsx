"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MicOff, Volume2, VolumeX, X } from "lucide-react";
import { Rating, type FSRS, type Grade } from "ts-fsrs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { getLocalDb } from "@/lib/db/local";
import { randomId } from "@/lib/db/ids";
import {
  ensureSkillCards,
  openExtraWords,
  planReview,
  recordReview,
  weightsOf,
  type ReviewInput,
} from "@/lib/db/repo";
import { recordSlow, timed, watchMainThread } from "@/lib/diagnostics/slow-log";
import { clearSession, markSessionFinished, saveSession } from "@/lib/db/review-store";
import type { Voice } from "@/lib/media/tts-azure";
import { studyDay, studyDayEnd } from "@/lib/review/day";
import { buildMcq, type ChoiceSense, type Mcq } from "@/lib/review/mcq";
import {
  canResume,
  intervalLabel,
  summarize,
  type Answer,
  type SavedSession,
  type SessionSummary,
} from "@/lib/review/session";
import { planToday } from "@/lib/review/today";
import { nextDueByRating } from "@/lib/srs/cards";
import {
  INTRO_RATING,
  gradeFromOutcome,
  medianResponseMs,
  modesForSkill,
  pickMode,
  type ReviewMode,
} from "@/lib/srs/grade";
import { listeningTaskKind, listeningVoice, spellingTaskKind } from "@/lib/review/listening";
import { buildPractice, type PracticeRequest } from "@/lib/review/practice";
import type { PronunciationLocale } from "@/lib/pronunciation/api";
import { masteryLevel, type MasteryLevel } from "@/lib/srs/mastery";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { remainingItems, requeue, type SessionItem } from "@/lib/srs/queue";
import { createScheduler } from "@/lib/srs/scheduler";
import { useOwner } from "@/lib/sync/owner";
import { Flashcard } from "./modes/flashcard";
import { MultipleChoice } from "./modes/multiple-choice";
import type { Intervals, ModeAnswer } from "./modes/types";
import { e2eOverride } from "./e2e";
import { canSpeak } from "./modes/listen-player";
import {
  Writing,
  buildListeningTask,
  buildWritingTask,
  clozeOfItem,
  type WritingTask,
} from "./modes/writing";
import {
  loadLocalChoices,
  moreChoices,
  prepareCards,
  readLocalWords,
  relatedOf,
  type PreparedCard,
} from "./session-content";
import { SessionResult } from "./session-result";
import { loadReviewData, toTodayInput, type ReviewData } from "./use-review-data";

export type SessionOptions = {
  /** Phiên ngắn 5 phút. */
  short?: boolean;
  /** "Học thêm N từ mới". */
  more?: number;
  /** "Ôn từ này": chỉ một thẻ. */
  cardId?: string;
  /** "Ôn lại từ sai". */
  retry?: string[];
  /** Luyện tập tự chọn (trang Luyện tập): phạm vi, chế độ, số câu. */
  practice?: PracticeRequest;
  /** Tiếp tục phiên dở. */
  resume?: boolean;
};

/**
 * Màn xem thẻ từ mới (thẻ đủ 5 tab) và tập phát âm kéo theo Supabase/Zod: tải riêng, và tải trước
 * ngay khi biết phiên có câu loại đó (`preloadModes`) để chuyển câu vẫn tức thì.
 */
const loadNewWord = () => import("./modes/new-word");
const loadSpeaking = () => import("./modes/speaking");
const NewWordIntro = dynamic(() => loadNewWord().then((m) => m.NewWordIntro), { ssr: false });
const Speaking = dynamic(() => loadSpeaking().then((m) => m.Speaking), { ssr: false });

function preloadModes(queue: readonly SessionItem[], cards: Map<string, PreparedCard>) {
  if (queue.some((i) => i.isNew)) void loadNewWord();
  if (queue.some((i) => cards.get(i.cardId)?.card.skill === "speaking")) void loadSpeaking();
}

type Kind = "full" | "short" | "single" | "retry" | "practice";

type Run = {
  kind: Kind;
  day: string;
  queue: SessionItem[];
  position: number;
  answers: Answer[];
  startedAt: string;
};

/** Cách hỏi câu hiện tại (chọn một lần khi câu hiện ra). */
type Ask =
  | { step: "intro" }
  | { step: "flashcard"; reverse: boolean; intervals: Intervals }
  | { step: "mcq"; mcq: Mcq; listen: boolean; voice: Voice }
  | { step: "writing"; task: WritingTask; listen: boolean; voice: Voice }
  | { step: "speaking"; voice: Voice; locale: PronunciationLocale };

const MUTE_KEY = "ww_review_muted";
/** Mốc đo chuyển câu (Performance API; E2E đọc NEXT_QUESTION_MEASURE). */
const ANSWER_MARK = "ww:answer";
const NEXT_QUESTION_MEASURE = "ww:next-question";
/** Chế độ đã có (GĐ4 thêm tập viết, tập nghe; phát âm ở GĐ5). */
const AVAILABLE_MODES: ReviewMode[] = ["flashcard", "mcq", "listening", "writing", "speaking"];

function preferredVoice(settings: ReviewData["settings"]): Voice {
  return settings.accent === "uk" ? "uk" : "us";
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function intervalsOf(scheduler: FSRS, card: PreparedCard["card"], now: Date): Intervals {
  const dues = nextDueByRating(scheduler, card, now);
  const out = {} as Intervals;
  for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[rating] = intervalLabel(now, dues[rating]);
  }
  return out;
}

export function SessionScreen({ options }: { options: SessionOptions }) {
  const t = useTranslations("review");
  const router = useRouter();
  const owner = useOwner();
  const [data, setData] = useState<ReviewData | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [prepared, setPrepared] = useState<Map<string, PreparedCard>>(new Map());
  const [pool, setPool] = useState<ChoiceSense[]>([]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [phase, setPhase] = useState<"loading" | "run" | "done" | "empty">("loading");
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [muted, setMuted] = useState(readMuted);
  const [confirmExit, setConfirmExit] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Số câu của phiên (đã làm + còn lại nếu trả lời đúng hết), tính lại mỗi khi sang câu mới. */
  const [total, setTotal] = useState(0);
  const started = useRef(false);
  /** Hàng ghi lượt ôn chạy nền (xem saveReview). */
  const writes = useRef<Promise<void>>(Promise.resolve());
  /** Thẻ ôn ngoài lịch ("Ôn từ này", "Ôn lại từ sai" khi chưa đến hạn). */
  const extraIds = useRef(new Set<string>());

  const scheduler = useRef<FSRS | null>(null);
  /** Giọng trong Cài đặt và "Luyện nhiều giọng" (tập nghe đổi ngẫu nhiên Mỹ/Anh). */
  const voices = useRef<{ preferred: Voice; multi: boolean }>({ preferred: "us", multi: false });

  /** Chọn cách hỏi cho câu ở vị trí `position` (không đổi state – xem showQuestion). */
  const buildAsk = useCallback(
    (r: Run, cards: Map<string, PreparedCard>, choices: ChoiceSense[]): Ask | null => {
      const item = r.queue[r.position];
      const prep = item && cards.get(item.cardId);
      if (!item || !prep) return null;
      const now = new Date();
      const flashcard = (reverse: boolean): Ask => ({
        step: "flashcard",
        reverse,
        intervals: intervalsOf(scheduler.current!, prep.card, now),
      });
      const level = masteryLevel(prep.card);
      const question = `${item.cardId}:${r.position}`;
      const voice = listeningVoice(voices.current.preferred, voices.current.multi);
      const can = {
        word: !!prep.word.media.audio[voice] || canSpeak(),
        sentence: !!clozeOfItem(prep) && (!!getSupabaseEnv() || canSpeak()),
      };
      // Phát âm chấm theo giọng trong Cài đặt (không đổi giọng ngẫu nhiên như tập nghe).
      if (prep.card.skill === "speaking") {
        const preferred = voices.current.preferred;
        return {
          step: "speaking",
          voice: preferred,
          locale: preferred === "uk" ? "en-GB" : "en-US",
        };
      }
      if (prep.card.skill === "spelling") {
        // Luyện tập chọn chế độ: Tập viết luôn viết; Tập nghe thì nghe (không phát được thì viết).
        const kind =
          e2eOverride("spellingKind", question) ??
          (item.mode === "writing"
            ? "writing"
            : item.mode === "listening"
              ? (listeningTaskKind(level, can) ?? "writing")
              : spellingTaskKind(level, can));
        return kind === "writing"
          ? { step: "writing", task: buildWritingTask(prep, level), listen: false, voice }
          : {
              step: "writing",
              task: buildListeningTask(prep, kind === "listen-type" ? "listen" : "listen-cloze"),
              listen: true,
              voice,
            };
      }
      if (prep.card.state === 0) return item.isNew ? { step: "intro" } : flashcard(false);
      // Thẻ Nghĩa chỉ có chế độ nhận biết: từ mức 1 trở lên trộn trắc nghiệm và nghe → chọn nghĩa.
      const meaningModes = modesForSkill("meaning", AVAILABLE_MODES).filter(
        (m) => m !== "listening" || can.word,
      );
      const forced = item.mode && meaningModes.includes(item.mode) ? item.mode : undefined;
      const mode =
        (e2eOverride("meaningMode", question) as ReviewMode | undefined) ??
        forced ??
        (item.mode === "listening"
          ? "mcq"
          : pickMode(Math.min(level, 1) as MasteryLevel, meaningModes));
      if (mode === "mcq" || mode === "listening") {
        const listen = mode === "listening";
        const mcq = buildMcq(
          {
            senseId: prep.senseId,
            wordId: prep.word.id,
            lemma: prep.word.content.lemma,
            pos: prep.word.content.pos,
            meaning: prep.meaning,
          },
          choices,
          {
            direction:
              !listen && level >= 2 && Math.random() < 0.5 ? "meaning-to-word" : "word-to-meaning",
            confusables: prep.confusables,
          },
        );
        if (mcq) return { step: "mcq", mcq, listen, voice };
      }
      return flashcard(level >= 2 && Math.random() < 0.3);
    },
    [],
  );

  /**
   * Hiện câu ở `r.position`: câu, nội dung thẻ, cách hỏi (đáp án) và tổng số câu đổi cùng một lần
   * vẽ – không bao giờ có lúc chữ/tiếng của câu mới đi với đáp án của câu cũ.
   */
  const showQuestion = useCallback(
    (r: Run, cards: Map<string, PreparedCard>, choices: ChoiceSense[]) => {
      const now = new Date();
      setPrepared(cards);
      setRun(r);
      // Đếm đủ số lần từ đang học còn quay lại: trả lời đúng thì số câu không tăng.
      setTotal(
        r.position +
          remainingItems(
            r.queue,
            r.position,
            (id) => cards.get(id)?.card,
            scheduler.current!,
            now,
            extraIds.current,
          ),
      );
      setAsk(buildAsk(r, cards, choices));
    },
    [buildAsk],
  );

  // Đo thời gian chuyển câu (mục tiêu < 100 ms): từ lúc trả lời tới khung hình có câu sau.
  const position = run?.position;
  useEffect(() => {
    if (!ask) return;
    const frame = requestAnimationFrame(() => {
      if (performance.getEntriesByName(ANSWER_MARK).length === 0) return;
      performance.measure(NEXT_QUESTION_MEASURE, ANSWER_MARK);
      performance.clearMarks(ANSWER_MARK);
    });
    return () => cancelAnimationFrame(frame);
  }, [ask, position]);

  // Nhật ký chậm: luồng chính bị đứng trong lúc ôn (xem Cài đặt → Nhật ký chậm).
  useEffect(() => watchMainThread(), []);

  // Xếp hàng phiên (một lần khi đã biết người dùng).
  useEffect(() => {
    if (!owner || started.current) return;
    started.current = true;
    void (async () => {
      const db = getLocalDb();
      const now = new Date();
      if (options.more) await openExtraWords(db, owner, options.more, now);
      await ensureSkillCards(db, owner, now);
      const fresh = await loadReviewData(owner);
      scheduler.current = createScheduler({
        desiredRetention: fresh.settings.desired_retention,
        weights: weightsOf(fresh.settings),
      });
      voices.current = {
        preferred: preferredVoice(fresh.settings),
        multi: fresh.settings.multi_accent ?? false,
      };
      const day = studyDay(now, fresh.settings.timezone);
      const learning = fresh.userWords.filter((u) => !u.deleted_at && u.status === "learning");
      const known = await readLocalWords(
        db,
        fresh,
        learning.map((u) => u.sense_id),
      );
      const input = toTodayInput(fresh, (senseId) => {
        const wordId = fresh.senses.get(senseId)?.word.id;
        const word = wordId ? known.get(wordId) : undefined;
        return word ? relatedOf(word) : [];
      });

      let next: Run;
      if (options.resume && canResume(fresh.saved, owner, day)) {
        const saved = fresh.saved!;
        next = {
          kind: "full",
          day,
          queue: saved.queue,
          position: saved.position,
          answers: saved.answers,
          startedAt: saved.startedAt,
        };
      } else if (options.practice) {
        const plan = buildPractice(
          {
            userWords: fresh.userWords,
            cards: fresh.cards,
            entries: fresh.entries,
            practiceSpelling: fresh.settings.practice_spelling ?? true,
            dayEnd: studyDayEnd(now, fresh.settings.timezone),
          },
          options.practice,
          scheduler.current,
          now,
        );
        for (const id of plan.extra) extraIds.current.add(id);
        next = {
          kind: "practice",
          day,
          queue: plan.items,
          position: 0,
          answers: [],
          startedAt: now.toISOString(),
        };
      } else if (options.cardId || options.retry?.length) {
        const ids = options.cardId ? [options.cardId] : options.retry!;
        const plan = planToday(input, scheduler.current, now, { onlyCardIds: new Set(ids) });
        const planned = new Set(plan.items.map((i) => i.cardId));
        const queue = [
          ...plan.items,
          ...ids.filter((id) => !planned.has(id)).map((cardId) => ({ cardId, isNew: false })),
        ];
        for (const id of ids) if (!planned.has(id)) extraIds.current.add(id);
        next = {
          kind: options.cardId ? "single" : "retry",
          day,
          queue,
          position: 0,
          answers: [],
          startedAt: now.toISOString(),
        };
      } else {
        const plan = planToday(input, scheduler.current, now, {
          short: options.short,
          extraNew: options.more,
        });
        next = {
          kind: options.short ? "short" : "full",
          day,
          queue: plan.items,
          position: 0,
          answers: [],
          startedAt: now.toISOString(),
        };
      }

      const cards = await prepareCards(
        db,
        fresh,
        next.queue.map((i) => i.cardId),
        known,
      );
      // Thẻ không có nội dung (offline, chưa tải được) bị bỏ qua.
      const kept = next.queue.filter((i) => cards.has(i.cardId));
      const position = Math.min(
        next.position -
          next.queue.slice(0, next.position).filter((i) => !cards.has(i.cardId)).length,
        kept.length,
      );
      next = { ...next, queue: kept, position };
      preloadModes(next.queue, cards);
      const empty = next.position >= next.queue.length;
      // Đáp án nhiễu: trong máy đủ thì không gọi mạng; ít (người mới) thì lấy thêm trong kho. Phiên
      // trống thì không cần.
      const choices = empty ? [] : await moreChoices(await loadLocalChoices(db));
      setData(fresh);
      setPool(choices);
      if (empty) {
        setPrepared(cards);
        setRun(next);
        setPhase("empty");
        return;
      }
      showQuestion(next, cards, choices);
      setPhase("run");
    })();
  }, [owner, options, showQuestion]);

  async function finish(r: Run) {
    const db = getLocalDb();
    // Các lượt ôn còn đang ghi nền phải xong trước khi đóng phiên (kết quả đọc từ IndexedDB).
    await writes.current;
    await clearSession(db, owner!);
    await markSessionFinished(db, owner!, r.day, r.kind === "full");
    setSummary(summarize(r.answers, new Date(r.startedAt), new Date()));
    setPhase("done");
  }

  /**
   * Ghi lượt ôn chạy nền, lần lượt theo thứ tự trả lời (IndexedDB trước, đồng bộ sau). Lỗi thì báo
   * (thẻ trong máy giữ lịch cũ, lần ôn sau vẫn gặp lại).
   */
  function saveReview(cardId: string, input: ReviewInput) {
    const db = getLocalDb();
    const delay = e2eOverride("saveDelayMs") ?? 0;
    writes.current = writes.current
      .then(() => new Promise((resolve) => setTimeout(resolve, delay)))
      .then(() => timed("write", input.mode, () => recordReview(db, owner!, cardId, input)))
      .then(
        () => undefined,
        (error: unknown) => {
          console.error("Ghi lượt ôn lỗi:", error);
          showToast({ text: t("saveFailed") });
        },
      );
  }

  /** `intro`: vừa xem xong thẻ từ mới – tự ghi "Khó", không có câu trả lời (correct = null). */
  async function handleAnswer(answer: ModeAnswer, intro = false) {
    if (!run || !owner || !data || busy || !ask) return;
    performance.mark(ANSWER_MARK);
    const answeredAt = Date.now();
    const item = run.queue[run.position]!;
    const prep = prepared.get(item.cardId)!;
    setBusy(true);
    try {
      const now = new Date();
      const mode: ReviewMode =
        ask.step === "mcq" || ask.step === "writing"
          ? ask.listen
            ? "listening"
            : ask.step
          : ask.step === "speaking"
            ? "speaking"
            : "flashcard";
      const levelBefore = masteryLevel(prep.card);
      const rating = intro
        ? INTRO_RATING
        : gradeFromOutcome({
            mode,
            ...answer,
            cardLevel: levelBefore,
            userMedianMs: medianResponseMs(data.logs, mode),
          });
      const extra = extraIds.current.has(item.cardId);
      const input: ReviewInput = {
        rating,
        mode,
        reviewedAt: now,
        responseMs: answer.responseMs,
        correct: intro ? undefined : answer.correct,
        hintLevel: answer.hintLevel,
        pronunciationScore: answer.pronunciationScore,
        extra,
        logId: randomId(),
      };
      // Tính lịch mới trong bộ nhớ và sang câu sau ngay; ghi IndexedDB chạy nền (máy bận có lúc
      // ghi mất cả phút – trước đây cả phiên đứng chờ).
      const result = planReview(
        prep.card,
        { owner, settings: data.settings, notebooks: data.notebooks, entries: data.entries },
        input,
      );
      saveReview(item.cardId, input);
      // Quên khi ôn ngoài lịch: lượt đó đã tính vào lịch, các lượt sau là ôn thật.
      if (extra && rating === Rating.Again) extraIds.current.delete(item.cardId);
      const cards = new Map(prepared).set(item.cardId, { ...prep, card: result.card });
      const answers: Answer[] = [
        ...run.answers,
        {
          cardId: item.cardId,
          wordId: prep.word.id,
          lemma: prep.word.content.lemma,
          rating,
          correct: answer.correct,
          levelBefore,
          levelAfter: masteryLevel(result.card),
          ...(intro ? { intro: true } : {}),
        },
      ];
      const again = rating === Rating.Again;
      const wordOf = (i: SessionItem) => cards.get(i.cardId)?.word.id ?? i.cardId;
      const queue = result.log.is_extra
        ? run.queue
        : requeue(
            run.queue,
            run.position,
            item,
            {
              again,
              nextDue: new Date(result.card.due),
              againCount: answers.filter(
                (a) => a.cardId === item.cardId && a.rating === Rating.Again,
              ).length,
            },
            now,
            Math.random,
            (a, b) => wordOf(a) === wordOf(b),
          );
      const next = { ...run, queue, position: run.position + 1, answers };
      if (next.position < next.queue.length)
        recordSlow("answer", answeredAt, Date.now() - answeredAt);
      await goTo(next, cards);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sang câu ở vị trí `next.position` (hết hàng thì kết thúc). Phiên dở lưu chạy nền: câu sau hiện
   * ngay, không chờ IndexedDB (máy bận có lúc chờ rất lâu); lưu lỗi thì chỉ mất chỗ tiếp tục.
   */
  async function goTo(next: Run, cards: Map<string, PreparedCard>) {
    if (next.position >= next.queue.length) {
      setPrepared(cards);
      setRun(next);
      await finish(next);
      return;
    }
    showQuestion(next, cards, pool);
    if (next.kind === "full" || next.kind === "short") {
      const saved: SavedSession = {
        owner: owner!,
        day: next.day,
        queue: next.queue,
        position: next.position,
        answers: next.answers,
        startedAt: next.startedAt,
      };
      const delay = e2eOverride("saveDelayMs") ?? 0;
      void new Promise((resolve) => setTimeout(resolve, delay))
        .then(() => saveSession(getLocalDb(), saved))
        .catch(() => undefined);
    }
  }

  /** Bỏ qua câu hiện tại mà không ghi lượt ôn (tập phát âm không chấm được). */
  function skip() {
    if (!run || busy) return;
    void goTo({ ...run, position: run.position + 1 }, prepared);
  }

  const isSpeaking = (i: SessionItem) => prepared.get(i.cardId)?.card.skill === "speaking";

  /** "Tạm tắt phát âm" (nơi công cộng): bỏ các câu phát âm còn lại của phiên, thẻ vẫn đến hạn. */
  function pauseSpeaking() {
    if (!run || busy) return;
    const rest = run.queue.slice(run.position).filter((i) => !isSpeaking(i));
    void goTo({ ...run, queue: [...run.queue.slice(0, run.position), ...rest] }, prepared);
  }

  function toggleMute() {
    const value = !muted;
    setMuted(value);
    try {
      localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      // Không lưu được: chỉ áp dụng cho phiên này.
    }
  }

  if (phase === "loading") {
    return (
      <p className="py-24 text-center text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (phase === "empty") {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-semibold">{t("emptyTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
        <Button className="min-h-11" onClick={() => router.push("/")}>
          {t("backHome")}
        </Button>
      </div>
    );
  }

  if (phase === "done" && summary && run && data) {
    return <SessionResult summary={summary} owner={owner!} kind={run.kind} />;
  }

  const item = run?.queue[run.position];
  const prep = item && prepared.get(item.cardId);
  if (!run || !item || !prep || !ask || !data) return null;
  const voice = preferredVoice(data.settings);

  return (
    <div className="flex min-h-dvh flex-col gap-4 pt-[env(safe-area-inset-top,0px)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <header className="flex h-14 items-center gap-2">
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => setConfirmExit(true)}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-5" aria-hidden />
        </button>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t("progress")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={run.position}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(run.position / total) * 100}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {run.position + 1}/{total}
        </span>
        {run.queue.slice(run.position).some(isSpeaking) && (
          <button
            type="button"
            aria-label={t("speak.pause")}
            title={t("speak.pause")}
            onClick={pauseSpeaking}
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MicOff className="size-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label={t(muted ? "unmute" : "mute")}
          aria-pressed={muted}
          onClick={toggleMute}
          className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {muted ? (
            <VolumeX className="size-5" aria-hidden />
          ) : (
            <Volume2 className="size-5" aria-hidden />
          )}
        </button>
      </header>

      <div key={`${run.position}:${item.cardId}:${ask.step}`} className="flex flex-1 flex-col">
        {ask.step === "intro" ? (
          <NewWordIntro
            item={prep}
            voice={voice}
            muted={muted}
            onContinue={(viewMs) => void handleAnswer({ correct: true, responseMs: viewMs }, true)}
          />
        ) : ask.step === "speaking" ? (
          <Speaking
            item={prep}
            voice={ask.voice}
            locale={ask.locale}
            muted={muted}
            onAnswer={(a) => void handleAnswer(a)}
            onSkip={skip}
          />
        ) : ask.step === "writing" ? (
          <Writing
            item={prep}
            voice={ask.voice}
            muted={muted}
            task={ask.task}
            onAnswer={(a) => void handleAnswer(a)}
          />
        ) : ask.step === "mcq" ? (
          <MultipleChoice
            item={prep}
            voice={ask.voice}
            muted={muted}
            mcq={ask.mcq}
            listen={ask.listen}
            onAnswer={(a) => void handleAnswer(a)}
          />
        ) : (
          <Flashcard
            item={prep}
            voice={voice}
            muted={muted}
            reverse={ask.reverse}
            intervals={ask.intervals}
            onAnswer={(a) => void handleAnswer(a)}
          />
        )}
      </div>

      {confirmExit && (
        <Sheet open onOpenChange={(o) => !o && setConfirmExit(false)} title={t("exitTitle")}>
          <p className="text-sm">{t("exitBody")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmExit(false)}>
              {t("stay")}
            </Button>
            <Button className="min-h-11" onClick={() => router.push("/")}>
              {t("exit")}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
