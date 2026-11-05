"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/local";
import { defaultSettingsRow } from "@/lib/db/repo";
import type { WordRow, WordSenseRow } from "@/lib/db/types";
import { forLanguage, learningLanguage } from "@/lib/lang/filter";
import type { PersonalData } from "@/lib/notebooks/notebooks";
import type { Pos } from "@/lib/schema/word";

export type SenseInfo = {
  wordId: string;
  lemma: string;
  pos: Pos;
  meaning: string;
};

export type PersonalView = PersonalData & {
  /** Ngôn ngữ đang học: sổ và từ trong bản này chỉ thuộc ngôn ngữ đó. */
  language: string;
  /** Nội dung chung của các nghĩa người dùng có (chưa tải về máy thì không có). */
  senses: Map<string, SenseInfo>;
  /** Múi giờ trong Cài đặt (đếm từ đến hạn theo ngày học). */
  timeZone: string;
};

/** Toàn bộ dữ liệu cá nhân trong máy, tự cập nhật khi IndexedDB đổi. */
export function usePersonalData(owner: string | null): PersonalView | undefined {
  return useLiveQuery(async () => {
    if (!owner) return undefined;
    const db = getLocalDb();
    const [notebooks, entries, userWords, cards, settings] = await Promise.all([
      db.notebooks.where("user_id").equals(owner).toArray(),
      db.notebook_entries.where("user_id").equals(owner).toArray(),
      db.user_words.where("user_id").equals(owner).toArray(),
      db.cards.where("user_id").equals(owner).toArray(),
      db.user_settings.get(owner),
    ]);
    const senseRows = (await db.word_senses.bulkGet(userWords.map((uw) => uw.sense_id))).filter(
      (s): s is WordSenseRow => !!s,
    );
    const wordRows = (await db.words.bulkGet([...new Set(senseRows.map((s) => s.word_id))])).filter(
      (w): w is WordRow => !!w,
    );
    const wordById = new Map(wordRows.map((w) => [w.id, w]));
    const senses = new Map<string, SenseInfo>();
    for (const sense of senseRows) {
      const word = wordById.get(sense.word_id);
      if (word) {
        senses.set(sense.id, {
          wordId: word.id,
          lemma: word.lemma,
          pos: word.pos as Pos,
          meaning: sense.meaning_vi,
        });
      }
    }
    const sense = new Map(senseRows.map((s) => [s.id, s]));
    const language = learningLanguage(settings?.target_language);
    const scoped = forLanguage(
      { notebooks, entries, userWords, cards },
      language,
      (senseId) => wordById.get(sense.get(senseId)?.word_id ?? "")?.language,
    );
    return {
      language,
      // Dòng cũ trong máy (trước khi có cột tags) coi như không có tag.
      notebooks: scoped.notebooks,
      entries: scoped.entries.map((e) => ({ ...e, tags: e.tags ?? [] })),
      userWords: scoped.userWords,
      cards: scoped.cards,
      senses,
      timeZone: (settings ?? defaultSettingsRow(owner)).timezone,
    };
  }, [owner]);
}
