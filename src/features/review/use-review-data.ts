"use client";

/**
 * Dữ liệu cho màn Hôm nay và phiên ôn, đọc từ IndexedDB và tự cập nhật khi dữ liệu đổi.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { defaultSettingsRow } from "@/lib/db/repo";
import { getLocalDb } from "@/lib/db/local";
import { completedDays, getSavedSession } from "@/lib/db/review-store";
import type {
  CardRow,
  NotebookEntryRow,
  ReviewLogRow,
  UserSettingsRow,
  UserWordRow,
  WordRow,
  WordSenseRow,
} from "@/lib/db/types";
import type { SavedSession } from "@/lib/review/session";
import type { TodayInput } from "@/lib/review/today";

export type ReviewData = {
  owner: string;
  settings: UserSettingsRow;
  userWords: UserWordRow[];
  cards: CardRow[];
  entries: NotebookEntryRow[];
  logs: ReviewLogRow[];
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
  const [settings, userWords, cards, entries, logs, done, saved] = await Promise.all([
    db.user_settings.get(owner),
    db.user_words.where("user_id").equals(owner).toArray(),
    db.cards.where("user_id").equals(owner).toArray(),
    db.notebook_entries.where("user_id").equals(owner).toArray(),
    db.review_logs.where("user_id").equals(owner).toArray(),
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
    logs,
    senses,
    completedDays: done,
    saved,
  };
}

export function toTodayInput(data: ReviewData, relatedOf?: TodayInput["relatedOf"]): TodayInput {
  return {
    userWords: data.userWords,
    cards: data.cards,
    entries: data.entries,
    logs: data.logs,
    settings: {
      dailyNewLimit: data.settings.daily_new_limit,
      dailyReviewLimit: data.settings.daily_review_limit,
      timeZone: data.settings.timezone,
    },
    lemmaOf: (senseId) => data.senses.get(senseId)?.word.lemma ?? "",
    ...(relatedOf ? { relatedOf } : {}),
  };
}
