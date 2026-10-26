/**
 * Phần thuần của phiên ôn: nhãn khoảng cách trên 4 nút flashcard, tóm tắt kết quả phiên, trạng
 * thái phiên lưu lại để "Tiếp tục phiên dở".
 */
import { Rating, type Grade } from "ts-fsrs";
import type { MasteryLevel } from "@/lib/srs/mastery";
import type { SessionItem } from "@/lib/srs/queue";

export type IntervalLabel = { unit: "minute" | "hour" | "day" | "month" | "year"; value: number };

/** Khoảng cách từ bây giờ tới lần ôn sau, làm tròn cho dễ đọc. */
export function intervalLabel(now: Date, due: Date): IntervalLabel {
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return { unit: "minute", value: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { unit: "hour", value: hours };
  const days = Math.round(hours / 24);
  if (days < 30) return { unit: "day", value: days };
  const months = Math.round(days / 30);
  if (months < 12) return { unit: "month", value: months };
  return { unit: "year", value: Math.round((days / 365) * 10) / 10 };
}

export type Answer = {
  cardId: string;
  wordId: string;
  lemma: string;
  rating: Grade;
  correct: boolean;
  levelBefore: MasteryLevel;
  levelAfter: MasteryLevel;
  /** Lượt xem xong từ mới (tự ghi "Khó"): không tính vào số câu và tỉ lệ đúng. */
  intro?: boolean;
};

export type SessionSummary = {
  answers: number;
  correct: number;
  /** 0–1. */
  accuracy: number;
  /** Số từ lên mức thuộc (so mức đầu phiên với mức cuối phiên). */
  levelUps: number;
  /** Từ sai nhiều nhất trước. */
  missed: { cardId: string; wordId: string; lemma: string; times: number }[];
  durationMs: number;
};

export function summarize(
  answers: readonly Answer[],
  startedAt: Date,
  endedAt: Date,
): SessionSummary {
  const asked = answers.filter((a) => !a.intro);
  const correct = asked.filter((a) => a.correct).length;
  const first = new Map<string, MasteryLevel>();
  const last = new Map<string, MasteryLevel>();
  const missed = new Map<string, SessionSummary["missed"][number]>();
  for (const a of answers) {
    if (!first.has(a.cardId)) first.set(a.cardId, a.levelBefore);
    last.set(a.cardId, a.levelAfter);
    if (!a.correct && !a.intro) {
      const m = missed.get(a.cardId) ?? {
        cardId: a.cardId,
        wordId: a.wordId,
        lemma: a.lemma,
        times: 0,
      };
      m.times++;
      missed.set(a.cardId, m);
    }
  }
  return {
    answers: asked.length,
    correct,
    accuracy: asked.length ? correct / asked.length : 0,
    levelUps: [...last].filter(([id, level]) => level > (first.get(id) ?? 0)).length,
    missed: [...missed.values()].sort(
      (a, b) => b.times - a.times || a.lemma.localeCompare(b.lemma),
    ),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };
}

/** Flashcard tự chấm: "Quên" là sai, còn lại là đúng (để tính tỉ lệ đúng). */
export function isCorrectRating(rating: Grade): boolean {
  return rating !== Rating.Again;
}

/** Phiên đang làm dở, lưu trong máy (bảng meta) để tiếp tục sau. */
export type SavedSession = {
  owner: string;
  /** Ngày (YYYY-MM-DD theo múi giờ) – sang ngày khác thì bỏ phiên cũ, xếp lại. */
  day: string;
  queue: SessionItem[];
  position: number;
  answers: Answer[];
  startedAt: string;
};

export function canResume(saved: SavedSession | null | undefined, owner: string, day: string) {
  return (
    !!saved && saved.owner === owner && saved.day === day && saved.position < saved.queue.length
  );
}
