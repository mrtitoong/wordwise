"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { notebookForList, type LibraryList } from "@/lib/library/library";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { useOwner } from "@/lib/sync/owner";
import { AddListSheet } from "./add-list-sheet";
import { fetchListWords, type ListWord } from "./library-data";
import type { PreviewWord } from "./library-server";
import { PickWordsSheet } from "./pick-words-sheet";
import { ListCover, useNotebooks, useStudyToday } from "./shared";

/** Chi tiết danh sách: mô tả, chủ đề con, 20 từ đầu, Thêm vào sổ tay / Chọn lọc từ. */
export function ListDetailScreen({ list, preview }: { list: LibraryList; preview: PreviewWord[] }) {
  const t = useTranslations("library");
  const tc = useTranslations("wordCard");
  const owner = useOwner();
  const notebooks = useNotebooks(owner);
  const today = useStudyToday(owner);
  const online = useOnlineStatus();
  const [sheet, setSheet] = useState<"pick" | "add" | null>(null);
  const [words, setWords] = useState<ListWord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const loading = useRef<Promise<ListWord[]> | null>(null);

  const loadWords = useCallback(() => {
    if (!loading.current) {
      setLoadFailed(false);
      loading.current = fetchListWords(list.id, list.version).then(
        (rows) => {
          setWords(rows);
          return rows;
        },
        (error: unknown) => {
          loading.current = null;
          setLoadFailed(true);
          throw error;
        },
      );
    }
    return loading.current;
  }, [list.id, list.version]);

  const added = notebooks ? notebookForList(notebooks, list.id) : null;
  const meta = [
    t("meta", { words: list.word_count }),
    list.target_cefr,
    list.purpose && t(`purposes.${list.purpose}`),
    list.suggested_days && t("days", { count: list.suggested_days }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-3">
        <ListCover listId={list.id} coverUrl={list.cover_url} className="-mx-4 h-32" />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">{list.title}</h1>
          <p className="text-sm text-muted-foreground">{meta}</p>
          <p className="text-xs text-muted-foreground">
            {t("learners", { count: list.learner_count })}
          </p>
        </div>
        {list.description && <p className="text-sm whitespace-pre-line">{list.description}</p>}
        {list.subtopics.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h2 className="text-sm font-medium">{t("detail.subtopics")}</h2>
            <p className="flex flex-wrap gap-1.5">
              {list.subtopics.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                >
                  {s}
                </span>
              ))}
            </p>
          </div>
        )}
      </header>

      {added ? (
        <div className="flex flex-col gap-2 rounded-xl bg-accent/50 p-3" role="status">
          <p className="text-sm">{t("detail.alreadyAdded", { name: added.name })}</p>
          <Button asChild className="min-h-11">
            <Link href={`/notebooks/${added.id}`}>{t("detail.openNotebook")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={!owner || !notebooks || !today || !online}
            onClick={() => setSheet("add")}
          >
            <Plus aria-hidden />
            {t("detail.add")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!online}
            onClick={() => {
              setSheet("pick");
              void loadWords().catch(() => {});
            }}
          >
            <ListChecks aria-hidden />
            {selected
              ? t("detail.picked", { count: selected.size, total: list.word_count })
              : t("detail.pick")}
          </Button>
          {!online && <p className="text-sm text-muted-foreground">{t("detail.offline")}</p>}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("detail.preview", { count: preview.length })}</h2>
        <ol className="flex flex-col divide-y">
          {preview.map((word, i) => (
            <li key={word.senseId} className="flex min-h-12 items-center gap-3 py-1.5">
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-medium" lang="en">
                    {word.lemma}
                  </span>
                  {word.pos && (
                    <span className="text-xs text-muted-foreground">
                      {tc(`posShort.${word.pos as "noun"}`)}
                    </span>
                  )}
                </span>
                <span className="truncate text-sm text-muted-foreground">{word.meaning}</span>
              </span>
            </li>
          ))}
        </ol>
        {list.word_count > preview.length && (
          <p className="text-sm text-muted-foreground">
            {t("detail.more", { count: list.word_count - preview.length })}
          </p>
        )}
      </section>

      {sheet === "pick" && (
        <PickWordsSheet
          words={words}
          failed={loadFailed}
          selected={selected}
          onRetry={() => void loadWords().catch(() => {})}
          onClose={() => setSheet(null)}
          onDone={(next) => {
            setSelected(next);
            setSheet(null);
          }}
        />
      )}
      {sheet === "add" && owner && notebooks && today && (
        <AddListSheet
          list={list}
          owner={owner}
          notebooks={notebooks}
          today={today}
          words={words}
          selected={selected}
          loadWords={loadWords}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
