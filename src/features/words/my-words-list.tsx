"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { getLocalDb } from "@/lib/db/local";
import type { WordRow, WordSenseRow } from "@/lib/db/types";
import { useOwner } from "@/lib/sync/owner";
import { wordHref } from "@/lib/words/links";
import { listMyWords } from "@/lib/words/my-words";

/** Các từ trong kho của người dùng, đọc từ IndexedDB; bấm một dòng để mở thẻ từ. */
export function MyWordsList() {
  const t = useTranslations();
  const owner = useOwner();
  const items = useLiveQuery(async () => {
    if (!owner) return undefined;
    const db = getLocalDb();
    const userWords = await db.user_words.where("user_id").equals(owner).toArray();
    const senses = (await db.word_senses.bulkGet(userWords.map((uw) => uw.sense_id))).filter(
      (s): s is WordSenseRow => !!s,
    );
    const words = (await db.words.bulkGet([...new Set(senses.map((s) => s.word_id))])).filter(
      (w): w is WordRow => !!w,
    );
    return listMyWords(
      userWords,
      new Map(senses.map((s) => [s.id, s])),
      new Map(words.map((w) => [w.id, w])),
    );
  }, [owner]);

  if (items === undefined) return null;
  if (items.length === 0) {
    return <EmptyState title={t("words.emptyTitle")} body={t("words.emptyBody")} />;
  }
  return (
    <ul aria-label={t("words.listLabel")} className="flex flex-col divide-y">
      {items.map((item) => (
        <li key={item.wordId}>
          <Link
            href={wordHref(item.wordId)}
            className="flex min-h-14 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium" lang="en">
                {item.lemma}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {t(`wordCard.posShort.${item.pos as "noun"}`)}
                </span>
              </span>
              <span className="truncate text-sm text-muted-foreground">{item.meaning}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
