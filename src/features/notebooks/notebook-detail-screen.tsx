"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  Copy,
  FolderInput,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { defaultNotebookId } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import {
  copyEntries,
  deleteNotebook,
  removeEntries,
  restoreSnapshot,
  setSuspended,
  updateNotebook,
  type Snapshot,
} from "@/lib/db/notebooks-repo";
import {
  NO_FILTER,
  countByStatus,
  filterEntries,
  filterOptions,
  notebookEntries,
  planRemoval,
  type EntryFilter,
  type EntryRow,
} from "@/lib/notebooks/notebooks";
import { LEARNING_STATUSES } from "@/lib/notebooks/progress";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";
import { wordHref } from "@/lib/words/links";
import { NotebookCover } from "./notebook-cover";
import { NotebookFormSheet } from "./notebook-form-sheet";
import { usePersonalData, type PersonalView } from "./use-personal-data";

const PAGE = 100;
const LONG_PRESS_MS = 500;

type SheetKind = "menu" | "edit" | "filter" | "move" | "copy" | "remove" | "delete" | null;

function LevelDots({ level }: { level: number }) {
  const t = useTranslations("notebooks.detail");
  return (
    <span className="flex gap-0.5" role="img" aria-label={t("level", { level })}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn("size-1.5 rounded-full", i <= level ? "bg-primary" : "bg-border")}
        />
      ))}
    </span>
  );
}

function rowLabel(row: EntryRow, data: PersonalView) {
  const sense = data.senses.get(row.userWord.sense_id);
  return {
    lemma: sense?.lemma ?? null,
    pos: sense?.pos ?? null,
    meaning: row.userWord.custom_meaning?.trim() || sense?.meaning || null,
    wordId: sense?.wordId ?? null,
  };
}

export function NotebookDetailScreen({ notebookId }: { notebookId: string }) {
  const t = useTranslations("notebooks.detail");
  const tc = useTranslations("wordCard");
  const router = useRouter();
  const owner = useOwner();
  const data = usePersonalData(owner);
  const [filter, setFilter] = useState<EntryFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetKind>(null);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);

  const notebook = data?.notebooks.find((n) => n.id === notebookId && !n.deleted_at);
  const rows = useMemo(
    () => (data && notebook ? notebookEntries(data, notebook.id) : []),
    [data, notebook],
  );
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const options = useMemo(() => filterOptions(rows), [rows]);
  const visible = useMemo(() => filterEntries(rows, filter), [rows, filter]);

  if (!data || !owner) return null;
  if (!notebook) {
    return <p className="py-12 text-center text-muted-foreground">{t("notFound")}</p>;
  }

  const db = getLocalDb();
  const isDefault = notebook.id === defaultNotebookId(owner);
  const selectedRows = rows.filter((r) => selected.has(r.entry.id));
  const otherNotebooks = data.notebooks.filter(
    (n) => !n.deleted_at && !n.is_archived && n.id !== notebook.id,
  );
  const allSuspended =
    selectedRows.length > 0 && selectedRows.every((r) => r.userWord.status === "suspended");

  const undoable = (text: string, snapshot: Snapshot) =>
    showToast({
      text,
      action: { label: t("undo"), run: () => void restoreSnapshot(db, owner, snapshot) },
    });

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggle(entryId: string) {
    const next = new Set(selected);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setSelected(next);
    if (next.size === 0) setSelecting(false);
  }

  function startPress(entryId: string) {
    longPressed.current = false;
    clearTimeout(press.current);
    press.current = setTimeout(() => {
      longPressed.current = true;
      setSelecting(true);
      setSelected(new Set([entryId]));
    }, LONG_PRESS_MS);
  }

  const endPress = () => clearTimeout(press.current);

  async function copyTo(targetId: string, move: boolean) {
    const ids = [...selected];
    const { copied, snapshot } = await copyEntries(db, owner!, ids, targetId, { move });
    setSheet(null);
    exitSelect();
    if (move) undoable(t("moved", { count: copied }), snapshot);
    else showToast({ text: t("copied", { count: copied }) });
  }

  async function suspend() {
    const resume = allSuspended;
    const snapshot = await setSuspended(
      db,
      owner!,
      selectedRows.map((r) => r.userWord.id),
      !resume,
    );
    exitSelect();
    undoable(t(resume ? "resumed" : "suspended", { count: snapshot.userWords.length }), snapshot);
  }

  async function remove() {
    const count = selected.size;
    const snapshot = await removeEntries(db, owner!, [...selected]);
    setSheet(null);
    exitSelect();
    undoable(t("removed", { count }), snapshot);
  }

  async function removeNotebook() {
    const snapshot = await deleteNotebook(db, owner!, notebook!.id);
    setSheet(null);
    router.push("/notebooks");
    undoable(t("deleted", { name: notebook!.name }), snapshot);
  }

  const removal = sheet === "remove" ? planRemoval(data, [...selected]) : null;
  const lemmaOf = (userWordId: string) => {
    const uw = data.userWords.find((u) => u.id === userWordId);
    return (uw && data.senses.get(uw.sense_id)?.lemma) ?? "?";
  };
  const filtersActive = !!filter.tag || !!filter.inputMethod;

  return (
    <div className="flex flex-col gap-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
      <header className="flex flex-col gap-3">
        <NotebookCover
          notebookId={notebook.id}
          coverUrl={notebook.cover_url}
          owner={owner}
          className="-mx-4 h-28"
        />
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl font-semibold break-words">{notebook.name}</h1>
            <p className="text-sm text-muted-foreground">
              {t("wordCount", { count: rows.length })}
              {notebook.is_archived && ` · ${t("archivedBadge")}`}
            </p>
            {notebook.description && <p className="text-sm">{notebook.description}</p>}
            {notebook.tags.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {notebook.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={t("menu")}
            onClick={() => setSheet("menu")}
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <MoreHorizontal className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <section className="flex flex-col items-center gap-3 py-10 text-center">
          <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
          <Button asChild className="min-h-11 w-full">
            <Link href={`/add?notebook=${notebook.id}`}>
              <Plus aria-hidden />
              {t("addToThis")}
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">{t("library")}</p>
        </section>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label={t("filters")}
              className="-mx-4 flex flex-1 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden"
            >
              {(["all", ...LEARNING_STATUSES] as const)
                .filter((s) => s === "all" || s !== "suspended" || counts.suspended > 0)
                .map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={filter.status === status}
                    onClick={() => setFilter({ ...filter, status })}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring",
                      filter.status === status
                        ? "border-primary bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`status.${status}`)}
                    <span className="tabular-nums">{counts[status]}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="-mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSheet("filter")}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 px-1 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                filtersActive ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              {t("moreFilters")}
            </button>
            {selecting ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="font-medium">{t("selected", { count: selected.size })}</span>
                <button
                  type="button"
                  onClick={exitSelect}
                  className="min-h-11 px-2 text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t("cancel")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <CheckSquare className="size-4" aria-hidden />
                {t("select")}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-muted-foreground">{t("noMatch")}</p>
              <Button variant="outline" className="min-h-11" onClick={() => setFilter(NO_FILTER)}>
                {t("clearFilters")}
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col divide-y" aria-label={notebook.name}>
              {visible.slice(0, limit).map((row) => {
                const label = rowLabel(row, data);
                const isSelected = selected.has(row.entry.id);
                const content = (
                  <>
                    {selecting && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                        className="size-5 shrink-0 accent-primary"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-medium" lang="en">
                          {label.lemma ?? "…"}
                        </span>
                        {label.pos && (
                          <span className="text-xs text-muted-foreground">
                            {tc(`posShort.${label.pos}`)}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {label.meaning ?? t("pending")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {row.status === "queued" || row.status === "suspended" ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t(`status.${row.status}`)}
                        </span>
                      ) : (
                        <LevelDots level={row.level} />
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {t(`method.${row.entry.input_method as "typed"}`)}
                      </span>
                    </span>
                  </>
                );
                const pressHandlers = {
                  onPointerDown: () => startPress(row.entry.id),
                  onPointerUp: endPress,
                  onPointerLeave: endPress,
                  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
                };
                const rowClass =
                  "flex min-h-14 w-full items-center gap-3 py-2 text-left select-none focus-visible:outline-2 focus-visible:outline-ring";
                return (
                  <li key={row.entry.id} className={cn(isSelected && "bg-accent/50")}>
                    {selecting ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={t("selectRow", { word: label.lemma ?? "" })}
                        onClick={() => toggle(row.entry.id)}
                        className={rowClass}
                      >
                        {content}
                      </button>
                    ) : (
                      <Link
                        href={label.wordId ? wordHref(label.wordId) : "#"}
                        onClick={(e) => {
                          if (longPressed.current || !label.wordId) e.preventDefault();
                        }}
                        className={rowClass}
                        {...pressHandlers}
                      >
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > limit && (
            <Button variant="outline" className="min-h-11" onClick={() => setLimit(limit + PAGE)}>
              {t("showMore")}
            </Button>
          )}
        </>
      )}

      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1 border-t bg-background px-2 py-1 shadow-lg">
            {[
              { key: "move", icon: FolderInput, onClick: () => setSheet("move") },
              { key: "copy", icon: Copy, onClick: () => setSheet("copy") },
              {
                key: allSuspended ? "resume" : "suspend",
                icon: allSuspended ? Play : Pause,
                onClick: () => void suspend(),
              },
              { key: "remove", icon: Trash2, onClick: () => setSheet("remove") },
            ].map(({ key, icon: Icon, onClick }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                  key === "remove" && "text-destructive",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(key as "move")}
              </button>
            ))}
          </div>
        </div>
      )}

      {sheet === "menu" && (
        <Sheet open onOpenChange={(o) => !o && setSheet(null)} title={notebook.name}>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setSheet("edit")}
              className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-muted"
            >
              <Pencil className="size-5" aria-hidden />
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                void updateNotebook(db, owner, notebook.id, { is_archived: !notebook.is_archived });
                setSheet(null);
              }}
              className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-muted"
            >
              {notebook.is_archived ? (
                <ArchiveRestore className="size-5" aria-hidden />
              ) : (
                <Archive className="size-5" aria-hidden />
              )}
              {t(notebook.is_archived ? "unarchive" : "archive")}
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={() => setSheet("delete")}
                className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-destructive hover:bg-muted"
              >
                <Trash2 className="size-5" aria-hidden />
                {t("delete")}
              </button>
            )}
          </div>
        </Sheet>
      )}

      {sheet === "edit" && (
        <NotebookFormSheet
          owner={owner}
          notebooks={data.notebooks}
          notebook={notebook}
          onClose={() => setSheet(null)}
          onSaved={() => {}}
        />
      )}

      {sheet === "filter" && (
        <Sheet open onOpenChange={(o) => !o && setSheet(null)} title={t("filterTitle")}>
          <div className="flex flex-col gap-4">
            {options.tags.length > 0 && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">{t("tag")}</legend>
                {[null, ...options.tags].map((tag) => (
                  <label
                    key={tag ?? "any"}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted"
                  >
                    <input
                      type="radio"
                      name="tag"
                      checked={filter.tag === tag}
                      onChange={() => setFilter({ ...filter, tag })}
                      className="size-4 accent-primary"
                    />
                    {tag ? `#${tag}` : t("any")}
                  </label>
                ))}
              </fieldset>
            )}
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">{t("inputMethod")}</legend>
              {[null, ...options.inputMethods].map((method) => (
                <label
                  key={method ?? "any"}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="method"
                    checked={filter.inputMethod === method}
                    onChange={() => setFilter({ ...filter, inputMethod: method })}
                    className="size-4 accent-primary"
                  />
                  {method ? t(`method.${method as "typed"}`) : t("any")}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                onClick={() => setFilter({ ...filter, tag: null, inputMethod: null })}
              >
                {t("clearFilters")}
              </Button>
              <Button className="min-h-11 flex-1" onClick={() => setSheet(null)}>
                {t("apply")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}

      {(sheet === "move" || sheet === "copy") && (
        <Sheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t(sheet === "move" ? "moveTitle" : "copyTitle", { count: selected.size })}
        >
          {otherNotebooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOtherNotebooks")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {otherNotebooks.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void copyTo(n.id, sheet === "move")}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <NotebookCover
                      notebookId={n.id}
                      coverUrl={n.cover_url}
                      owner={owner}
                      className="size-9 shrink-0 rounded-md"
                    />
                    <span className="truncate">{n.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {sheet === "remove" && removal && (
        <Sheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t("removeTitle", { count: selected.size })}
        >
          <div className="flex flex-col gap-2 text-sm">
            {removal.keep.map((k) => (
              <p key={k.userWordId}>
                {t("keep", {
                  word: lemmaOf(k.userWordId),
                  notebooks: k.notebookNames.join("”, “"),
                })}
              </p>
            ))}
            {removal.drop.length > 0 && (
              <p className="text-destructive">
                {t("drop", { words: removal.drop.map(lemmaOf).join(", ") })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => setSheet(null)}>
              {t("keepButton")}
            </Button>
            <Button variant="destructive" className="min-h-11 flex-1" onClick={() => void remove()}>
              {t("removeButton", { count: selected.size })}
            </Button>
          </div>
        </Sheet>
      )}

      {sheet === "delete" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t("deleteTitle", { name: notebook.name })}
          description={t("deleteBody", { count: rows.length })}
        >
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => setSheet(null)}>
              {t("keepButton")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-11 flex-1"
              onClick={() => void removeNotebook()}
            >
              {t("deleteButton")}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
