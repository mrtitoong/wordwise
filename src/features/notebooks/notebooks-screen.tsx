"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Library, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { defaultNotebookId } from "@/lib/db/ids";
import { studyDayEnd } from "@/lib/review/day";
import {
  countOwnedWords,
  summarizeNotebooks,
  type NotebookSummary,
} from "@/lib/notebooks/notebooks";
import { useOwner } from "@/lib/sync/owner";
import { wordHref } from "@/lib/words/links";
import { NotebookCover } from "./notebook-cover";
import { NotebookFormSheet } from "./notebook-form-sheet";
import { usePersonalData } from "./use-personal-data";

/** Bỏ dấu tiếng Việt và hoa thường để tìm "kien cuong" ra "kiên cường". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function NotebookItem({ summary, owner }: { summary: NotebookSummary; owner: string }) {
  const t = useTranslations("notebooks");
  const { notebook } = summary;
  return (
    <li>
      <Link
        href={`/notebooks/${notebook.id}`}
        className="flex min-h-16 items-center gap-3 rounded-xl border p-2 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <NotebookCover
          notebookId={notebook.id}
          coverUrl={notebook.cover_url}
          owner={owner}
          className="size-14 shrink-0 rounded-lg"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{notebook.name}</span>
          <span className="text-sm text-muted-foreground">
            {t("stats", { words: summary.wordCount, due: summary.dueCount })}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function NotebooksScreen() {
  const t = useTranslations("notebooks");
  const router = useRouter();
  const owner = useOwner();
  const data = usePersonalData(owner);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const summaries = useMemo(() => {
    if (!data || !owner) return [];
    const now = new Date();
    return summarizeNotebooks(data, now, defaultNotebookId(owner), studyDayEnd(now, data.timeZone));
  }, [data, owner]);
  const ownedCount = useMemo(() => (data ? countOwnedWords(data) : 0), [data]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!data || !q) return [];
    const liveWords = new Set(data.entries.filter((e) => !e.deleted_at).map((e) => e.user_word_id));
    const seen = new Set<string>();
    const found: { wordId: string; lemma: string; meaning: string }[] = [];
    for (const uw of data.userWords) {
      if (uw.deleted_at || !liveWords.has(uw.id)) continue;
      const sense = data.senses.get(uw.sense_id);
      if (!sense || seen.has(sense.wordId)) continue;
      const meaning = uw.custom_meaning?.trim() || sense.meaning;
      if (fold(sense.lemma).includes(q) || fold(meaning).includes(q)) {
        seen.add(sense.wordId);
        found.push({ wordId: sense.wordId, lemma: sense.lemma, meaning });
      }
    }
    return found.sort((a, b) => a.lemma.localeCompare(b.lemma)).slice(0, 50);
  }, [data, query]);

  if (!data || !owner) return null;

  const active = summaries.filter((s) => !s.notebook.is_archived);
  const archived = summaries.filter((s) => s.notebook.is_archived);
  const onlyEmptyDefault =
    active.length <= 1 &&
    ownedCount === 0 &&
    (active[0]?.notebook.id ?? "") === defaultNotebookId(owner);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder", { count: ownedCount })}
            className="h-11 w-full rounded-full border bg-background pr-3 pl-9 text-base focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-full"
          onClick={() => setCreating(true)}
          aria-label={t("newNotebook")}
        >
          <Plus aria-hidden />
          <span className="hidden min-[400px]:inline">{t("newNotebook")}</span>
        </Button>
      </div>

      {query.trim() ? (
        results.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">{t("noResults")}</p>
        ) : (
          <ul aria-label={t("searchLabel")} className="flex flex-col divide-y">
            {results.map((r) => (
              <li key={r.wordId}>
                <Link
                  href={wordHref(r.wordId)}
                  className="flex min-h-14 flex-col justify-center py-2 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="font-medium" lang="en">
                    {r.lemma}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{r.meaning}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <ul aria-label={t("listLabel")} className="flex flex-col gap-2">
            {active.map((summary) => (
              <NotebookItem key={summary.notebook.id} summary={summary} owner={owner} />
            ))}
          </ul>

          {onlyEmptyDefault && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("starterHint")}</p>
              <Button asChild className="min-h-11">
                <Link href="/add">
                  <Plus aria-hidden />
                  {t("addWords")}
                </Link>
              </Button>
            </div>
          )}

          <Link
            href="/library"
            className="flex min-h-16 items-center gap-3 rounded-xl bg-muted p-3 text-muted-foreground hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Library className="size-6 shrink-0" aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="font-medium text-foreground">{t("libraryTitle")}</span>
              <span className="text-sm">{t("libraryBody")}</span>
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>

          {archived.length > 0 && (
            <section className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived(!showArchived)}
                className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t("archived", { count: archived.length })}
                <ChevronDown
                  className={`size-4 transition-transform ${showArchived ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {showArchived && (
                <ul className="flex flex-col gap-2">
                  {archived.map((summary) => (
                    <NotebookItem key={summary.notebook.id} summary={summary} owner={owner} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {creating && (
        <NotebookFormSheet
          owner={owner}
          notebooks={data.notebooks}
          onClose={() => setCreating(false)}
          onSaved={(row) => router.push(`/notebooks/${row.id}`)}
        />
      )}
    </div>
  );
}
