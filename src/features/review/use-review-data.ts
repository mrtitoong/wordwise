"use client";

/**
 * Dữ liệu cho màn Hôm nay và phiên ôn, đọc từ IndexedDB và tự cập nhật khi dữ liệu đổi.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { defaultSettingsRow } from "@/lib/db/repo";
import { GUEST_OWNER } from "@/lib/db/ids";
import { letterCount } from "@/lib/grading/spelling";
import type { TimingCard } from "@/lib/srs/grade";
import { getLocalDb } from "@/lib/db/local";
import { completedDays, freeLogIds, getSavedSession } from "@/lib/db/review-store";
import type {
  CardRow,
  NotebookEntryRow,
  NotebookRow,
  ReviewLogRow,
  UserSettingsRow,
  UserWordRow,
  WordRow,
  WordSenseRow,
} from "@/lib/db/types";
import { forLanguage, learningLanguage } from "@/lib/lang/filter";
import type { SavedSession } from "@/lib/review/session";
import type { TodayInput } from "@/lib/review/today";

export type ReviewData = {
  owner: string;
  settings: UserSettingsRow;
  userWords: UserWordRow[];
  cards: CardRow[];
  entries: NotebookEntryRow[];
  notebooks: NotebookRow[];
  logs: ReviewLogRow[];
  freeLogs: Set<string>;
  /** sense_id → từ và nghĩa (nội dung đã có trong máy). */
  senses: Map<string, { word: WordRow; sense: WordSenseRow }>;
  completedDays: Set<string>;
  saved: SavedSession | null;
};

export function useReviewData(owner: string | null): ReviewData | undefined {
  return useLiveQuery(async () => (owner ? loadReviewData(owner) : undefined), [owner]);
}

/** Đọc một lần (phiên ôn cần bản mới nhất ngay sau khi ghi). */
export async function loadReviewData(owner: string): Promise<ReviewData> {
  const db = getLocalDb();
  const [settings, userWords, cards, entries, notebooks, logs, freeLogs, done, saved] =
    await Promise.all([
      db.user_settings.get(owner),
      db.user_words.where("user_id").equals(owner).toArray(),
      db.cards.where("user_id").equals(owner).toArray(),
      db.notebook_entries.where("user_id").equals(owner).toArray(),
      db.notebooks.where("user_id").equals(owner).toArray(),
      db.review_logs.where("user_id").equals(owner).toArray(),
      freeLogIds(db, owner),
      completedDays(db, owner),
      getSavedSession(db, owner),
    ]);
  const senseRows = (await db.word_senses.bulkGet(userWords.map((uw) => uw.sense_id))).filter(
    (s): s is WordSenseRow => !!s,
  );
  const words = new Map(
    (await db.words.bulkGet([...new Set(senseRows.map((s) => s.word_id))]))
      .filter((w): w is WordRow => !!w)
      .map((w) => [w.id, w]),
  );
  const senses = new Map<string, { word: WordRow; sense: WordSenseRow }>();
  for (const sense of senseRows) {
    const word = words.get(sense.word_id);
    if (word) senses.set(sense.id, { word, sense });
  }
  return {
    owner,
    settings: settings ?? defaultSettingsRow(owner),
    userWords,
    cards,
    entries,
    notebooks,
    logs,
    freeLogs,
    senses,
    completedDays: done,
    saved,
  };
}

/** Thẻ → kỹ năng và số chữ cái của từ, để so thời gian trả lời (`timingBaseline`). */
export function timingCards(data: ReviewData): Map<string, TimingCard> {
  const senseOf = new Map(data.userWords.map((uw) => [uw.id, uw.sense_id]));
  return new Map(
    data.cards.map((card) => {
      const lemma = data.senses.get(senseOf.get(card.user_word_id) ?? "")?.word.lemma ?? "";
      return [card.id, { skill: card.skill, letters: letterCount(lemma) }];
    }),
  );
}

export function toTodayInput(data: ReviewData, relatedOf?: TodayInput["relatedOf"]): TodayInput {
  const scoped = forLanguage(
    data,
    learningLanguage(data.settings.target_language),
    (senseId) => data.senses.get(senseId)?.word.language,
  );
  const cardIds = new Set(scoped.cards.map((c) => c.id));
  return {
    ...scoped,
    // Số từ mới và giới hạn ôn riêng từng ngôn ngữ; chuỗi ngày chung đọc thẳng data.logs.
    logs: data.logs.filter((l) => cardIds.has(l.card_id)),
    freeLogIds: data.freeLogs,
    settings: {
      dailyNewLimit: data.settings.daily_new_limit,
      dailyReviewLimit: data.settings.daily_review_limit,
      timeZone: data.settings.timezone,
      practiceSpelling: data.settings.practice_spelling ?? true,
      // Chấm phát âm cần tài khoản: khách không có thẻ Phát âm trong phiên.
      practiceSpeaking: (data.settings.practice_speaking ?? false) && data.owner !== GUEST_OWNER,
    },
    lemmaOf: (senseId) => data.senses.get(senseId)?.word.lemma ?? "",
    ...(relatedOf ? { relatedOf } : {}),
  };
}
