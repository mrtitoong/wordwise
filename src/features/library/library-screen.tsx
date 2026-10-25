"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  NO_LIBRARY_FILTER,
  filterLibrary,
  libraryFacets,
  notebookForList,
  type LibraryFilter,
  type LibraryList,
} from "@/lib/library/library";
import { useOwner } from "@/lib/sync/owner";
import { ListCover, chipClass, useNotebooks } from "./shared";

function ChipRow<T extends string>({
  label,
  values,
  value,
  allLabel,
  labelOf,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T | null;
  allLabel: string;
  labelOf: (v: T) => string;
  onChange: (v: T | null) => void;
}) {
  if (values.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden"
    >
      {([null, ...values] as (T | null)[]).map((v) => (
        <button
          key={v ?? "all"}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={chipClass(value === v)}
        >
          {v === null ? allLabel : labelOf(v)}
        </button>
      ))}
    </div>
  );
}

/** Thư viện: danh sách đã xuất bản, lọc theo ngôn ngữ, trình độ, mục đích. */
export function LibraryScreen({ lists }: { lists: LibraryList[] | null }) {
  const t = useTranslations("library");
  const owner = useOwner();
  const notebooks = useNotebooks(owner);
  const [filter, setFilter] = useState<LibraryFilter>(NO_LIBRARY_FILTER);
  const facets = useMemo(() => libraryFacets(lists ?? []), [lists]);
  const visible = useMemo(() => filterLibrary(lists ?? [], filter), [lists, filter]);

  if (lists === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <WifiOff className="size-8" aria-hidden />
        <p>{t("unavailable")}</p>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 py-12 text-center">
        <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
        <p className="text-muted-foreground">{t("emptyBody")}</p>
        <Button asChild className="min-h-11">
          <Link href="/add">
            <Plus aria-hidden />
            {t("addOwn")}
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className="flex flex-col gap-1" aria-label={t("filters")} role="group">
        <ChipRow
          label={t("language")}
          values={facets.languages}
          value={filter.language}
          allLabel={t("all")}
          labelOf={(v) => (v === "en" ? t("languages.en") : v)}
          onChange={(language) => setFilter({ ...filter, language })}
        />
        <ChipRow
          label={t("level")}
          values={facets.cefr}
          value={filter.cefr as (typeof facets.cefr)[number] | null}
          allLabel={t("all")}
          labelOf={(v) => v}
          onChange={(cefr) => setFilter({ ...filter, cefr })}
        />
        <ChipRow
          label={t("purpose")}
          values={facets.purposes}
          value={filter.purpose}
          allLabel={t("all")}
          labelOf={(v) => t(`purposes.${v}`)}
          onChange={(purpose) => setFilter({ ...filter, purpose })}
        />
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-muted-foreground">{t("noMatch")}</p>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => setFilter(NO_LIBRARY_FILTER)}
          >
            {t("clearFilters")}
          </Button>
        </div>
      ) : (
        <ul aria-label={t("title")} className="flex flex-col gap-2">
          {visible.map((list) => {
            const added = notebooks ? notebookForList(notebooks, list.id) : null;
            return (
              <li key={list.id}>
                <Link
                  href={`/library/${list.id}`}
                  className="flex min-h-20 items-center gap-3 rounded-xl border p-2 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ListCover
                    listId={list.id}
                    coverUrl={list.cover_url}
                    className="size-16 shrink-0 rounded-lg"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{list.title}</span>
                      {added && (
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                          {t("added")}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        t("meta", { words: list.word_count }),
                        list.target_cefr,
                        list.purpose && t(`purposes.${list.purpose}`),
                        list.suggested_days && t("days", { count: list.suggested_days }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("learners", { count: list.learner_count })}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
