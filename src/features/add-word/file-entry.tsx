"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { FileUp, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { getLocalDb } from "@/lib/db/local";
import { randomId } from "@/lib/db/ids";
import {
  IMPORT_FIELDS,
  MAX_FILE_BYTES,
  bestSenseByMeaning,
  detectColumns,
  looksLikeHeader,
  personalNote,
  readRows,
  type ColumnMapping,
  type ImportField,
  type ImportRow,
} from "@/lib/entry/file-import";
import { importProgress, type ImportItem, type ImportRecord } from "@/lib/entry/import-record";
import { normalizeEntry, type NormalizedEntry } from "@/lib/entry/normalize";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import type { ResolveResponse } from "@/lib/words/api";
import { resolveWords } from "@/lib/words/request-word";
import { startImport } from "@/features/import/import-runner";
import type { EntryContext } from "./add-word-screen";
import { usePlan } from "./use-plan";

const CHUNK = 50;
const PREVIEW_LIMIT = 100;
const PREMIUM_DAILY = 300;

type Table = { name: string; rows: string[][] };

const cellText = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);

async function readFile(file: File): Promise<Table[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((r) => r.map(cellText)) }));
  }
  const Papa = (await import("papaparse")).default;
  const rows = await new Promise<string[][]>((resolve, reject) =>
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => resolve(result.data),
      error: reject,
    }),
  );
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return [{ name: file.name, rows }];
}

const columnName = (i: number) =>
  i < 26
    ? String.fromCharCode(65 + i)
    : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;

type Preview = {
  row: ImportRow;
  entry: NormalizedEntry | null;
  senseId: string | null;
};

/** Tab File: chọn file → ánh xạ cột → kiểm tra trong kho → xem trước → nhập nền. */
export function FileEntry({ context }: { context: EntryContext }) {
  const t = useTranslations("addWord.file");
  const ta = useTranslations("addWord");
  const plan = usePlan(context.owner, context.signedIn);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[] | null>(null);
  const [sheet, setSheet] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [resolved, setResolved] = useState<Map<string, ResolveResponse["items"][number]> | null>(
    null,
  );
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [choosing, setChoosing] = useState<number | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const active = useLiveQuery(
    async () =>
      (await getLocalDb().imports.where("owner").equals(context.owner).toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0] ?? null,
    [context.owner],
  );

  const table = tables?.[sheet];
  const rows = useMemo(
    () => (table && mapping.includes("word") ? readRows(table.rows, mapping, hasHeader) : []),
    [table, mapping, hasHeader],
  );

  const previews = useMemo<Preview[]>(() => {
    if (!resolved) return [];
    const seenLemma = new Set<string>();
    return rows.map((row, i) => {
      if (row.error || row.duplicateOf !== null) return { row, entry: null, senseId: null };
      const resolution = resolved.get(row.word.toLowerCase()) ?? null;
      let entry = normalizeEntry(
        { text: row.word, context: row.example, note: personalNote(row) },
        resolution,
        context.inNotebookSenseIds,
      );
      if (entry.status !== "invalid" && seenLemma.has(entry.lemma)) {
        entry = { ...entry, status: "duplicate", options: [] } as NormalizedEntry;
      }
      seenLemma.add(entry.lemma);
      const senseId =
        entry.status === "ready" || entry.status === "choose"
          ? (choices[i] ??
            bestSenseByMeaning(
              entry.options.filter((o) => !context.inNotebookSenseIds.has(o.senseId)),
              row.meaning,
            ) ??
            entry.senseId)
          : null;
      return { row, entry, senseId };
    });
  }, [rows, resolved, context.inNotebookSenseIds, choices]);

  const known = previews.filter((p) => p.senseId).length;
  const fresh = previews.filter((p) => p.entry?.status === "new").length;
  const skippedCount = previews.length - known - fresh;

  if (!context.signedIn) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm">{t("needAccount")}</p>
        <Button asChild className="min-h-11">
          <Link href="/login?next=%2Fadd">{t("signIn")}</Link>
        </Button>
      </section>
    );
  }
  if (plan === "free") {
    return (
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          {t("premiumTitle")}
        </h2>
        <p className="text-sm">{t("premiumBody")}</p>
      </section>
    );
  }
  if (plan === null) return null;

  if (active && (active.status !== "done" || !tables)) {
    return <ImportProgressCard record={active} />;
  }

  async function onFile(file: File) {
    setError(null);
    setResolved(null);
    setChoices({});
    if (file.size > MAX_FILE_BYTES) {
      setError(t("tooLarge"));
      return;
    }
    try {
      const read = (await readFile(file)).filter((s) => s.rows.length > 0);
      if (read.length === 0) {
        setError(t("empty"));
        return;
      }
      const first = read[0]!;
      const header = looksLikeHeader(first.rows[0] ?? []);
      setTables(read);
      setSheet(0);
      setHasHeader(header);
      setMapping(detectColumns(header ? first.rows[0]! : first.rows[0]!.map(() => "")));
      setFileName(file.name);
    } catch {
      setError(t("unsupported"));
    }
  }

  async function check() {
    if (!context.online || !getSupabaseEnv()) {
      setError(t("needOnline"));
      return;
    }
    setError(null);
    const words = [
      ...new Set(
        rows.filter((r) => !r.error && r.duplicateOf === null).map((r) => r.word.toLowerCase()),
      ),
    ];
    const map = new Map<string, ResolveResponse["items"][number]>();
    try {
      for (let i = 0; i < words.length; i += CHUNK) {
        setChecking({ done: i, total: words.length });
        const chunk = words.slice(i, i + CHUNK);
        const { items } = await resolveWords(createClient(), chunk);
        chunk.forEach((word, j) => map.set(word, items[j]!));
      }
      setResolved(map);
    } catch {
      setError(t("needOnline"));
    } finally {
      setChecking(null);
    }
  }

  async function start() {
    const items: ImportItem[] = previews.flatMap((p): ImportItem[] => {
      if (!p.entry) return [];
      const base = {
        line: p.row.line,
        lemma: p.entry.lemma,
        context: p.row.example,
        note: personalNote(p.row),
        tags: p.row.tags,
      };
      if (p.senseId) return [{ ...base, senseId: p.senseId, state: "pending" }];
      if (p.entry.status === "new") return [{ ...base, senseId: null, state: "pending" }];
      return [];
    });
    await startImport({
      id: randomId(),
      owner: context.owner,
      notebookId: context.notebookId,
      notebookName: context.notebookName,
      fileName: fileName ?? "file",
      items,
    });
    setTables(null);
    setResolved(null);
  }

  if (!tables) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center focus-within:outline-2 focus-within:outline-ring">
          <FileUp className="size-6 text-primary" aria-hidden />
          <span className="font-medium">{t("pick")}</span>
          <span className="text-xs text-muted-foreground">{t("hint")}</span>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const headerRow = table!.rows[0] ?? [];
  const errorCount = rows.filter((r) => r.error || r.duplicateOf !== null).length;
  const listed = (
    onlyErrors ? previews.filter((p) => !p.entry || p.entry.status === "invalid") : previews
  ).slice(0, PREVIEW_LIMIT);
  const total = known + fresh;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium">{fileName}</span>{" "}
          <span className="text-muted-foreground">· {t("rows", { count: rows.length })}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setTables(null);
            setResolved(null);
          }}
          className="min-h-11 shrink-0 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("change")}
        </button>
      </div>

      {tables.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          {t("sheet")}
          <select
            value={sheet}
            onChange={(e) => {
              const index = Number(e.target.value);
              const next = tables[index]!;
              const header = looksLikeHeader(next.rows[0] ?? []);
              setSheet(index);
              setHasHeader(header);
              setMapping(detectColumns(header ? next.rows[0]! : next.rows[0]!.map(() => "")));
              setResolved(null);
            }}
            className="min-h-11 flex-1 rounded-lg border bg-background px-2"
          >
            {tables.map((s, i) => (
              <option key={i} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={hasHeader}
          onChange={(e) => {
            setHasHeader(e.target.checked);
            setResolved(null);
          }}
          className="size-5 accent-primary"
        />
        {t("hasHeader")}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t("mappingTitle")}</legend>
        {headerRow.map((cell, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {columnName(i)}: {hasHeader && cell ? `“${cell}”` : ""}
            </span>
            <select
              aria-label={t("column", { name: columnName(i) })}
              value={mapping[i] ?? "skip"}
              onChange={(e) => {
                const value = e.target.value === "skip" ? null : (e.target.value as ImportField);
                setMapping(
                  mapping.map((m, j) => (j === i ? value : m === value && value ? null : m)),
                );
                setResolved(null);
              }}
              className="min-h-11 w-40 rounded-lg border bg-background px-2"
            >
              {[...IMPORT_FIELDS, "skip" as const].map((field) => (
                <option key={field} value={field}>
                  {t(`field.${field}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      {!mapping.includes("word") && (
        <p className="text-sm text-destructive" role="alert">
          {t("needWordColumn")}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!resolved && (
        <Button
          className="min-h-11"
          disabled={!mapping.includes("word") || !!checking || rows.length === 0}
          onClick={() => void check()}
        >
          {checking ? t("checking", checking) : t("check")}
        </Button>
      )}

      {resolved && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("previewTitle")}</h2>
            {errorCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyErrors(!onlyErrors)}
                className="min-h-11 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                {onlyErrors ? t("showAll") : t("showErrors", { count: errorCount })}
              </button>
            )}
          </div>
          <ul aria-label={t("previewLabel")} className="flex flex-col divide-y rounded-xl border">
            {listed.map((p) => {
              const index = previews.indexOf(p);
              const bad = !!p.row.error || p.row.duplicateOf !== null;
              const option =
                p.entry && (p.entry.status === "ready" || p.entry.status === "choose")
                  ? p.entry.options.find((o) => o.senseId === p.senseId)
                  : undefined;
              const status = p.row.error
                ? t(`error.${p.row.error}`)
                : p.row.duplicateOf !== null
                  ? t("duplicateLine", { line: p.row.duplicateOf })
                  : p.entry?.status === "duplicate"
                    ? t("inNotebook")
                    : p.entry?.status === "new"
                      ? t("newWord")
                      : p.entry?.status === "invalid" || p.entry?.status === "unresolved"
                        ? t("error.not_a_word")
                        : (option?.meaning ?? "");
              return (
                <li
                  key={p.row.line}
                  className={cn(
                    "flex min-h-12 items-center gap-2 px-3 py-2",
                    bad && "bg-destructive/5 text-destructive",
                  )}
                >
                  <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {p.row.line}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium" lang="en">
                      {p.entry?.changed
                        ? `${p.entry.surface} → ${p.entry.lemma}`
                        : p.row.word || "—"}
                      {p.row.tags.length > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {p.row.tags.map((tag) => `#${tag}`).join(" ")}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{status}</span>
                  </span>
                  {p.entry?.status === "choose" && (
                    <button
                      type="button"
                      onClick={() => setChoosing(index)}
                      className="min-h-11 shrink-0 rounded-full border px-3 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {t("senses", { count: p.entry.options.length })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {previews.length > PREVIEW_LIMIT && !onlyErrors && (
            <p className="text-sm text-muted-foreground">
              {t("moreRows", { count: previews.length - PREVIEW_LIMIT })}
            </p>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
            <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
              <p className="text-sm">
                <span className="font-semibold">{t("summaryTitle", { count: total })}</span>
                <br />
                <span className="text-muted-foreground">
                  {t("summary", { known, fresh, skipped: skippedCount })}
                </span>
                {fresh > PREMIUM_DAILY && (
                  <>
                    <br />
                    <span className="text-muted-foreground">
                      {t("freshLimit", { limit: PREMIUM_DAILY })}
                    </span>
                  </>
                )}
              </p>
              <Button className="min-h-11" disabled={total === 0} onClick={() => void start()}>
                {t("start", { count: total })}
              </Button>
            </div>
          </div>
        </>
      )}

      {choosing !== null && previews[choosing]?.entry?.status === "choose" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setChoosing(null)}
          title={t("choose", { word: previews[choosing]!.entry!.lemma })}
        >
          <div className="flex flex-col gap-1">
            {(
              previews[choosing]!.entry as Extract<NormalizedEntry, { status: "choose" }>
            ).options.map((option) => (
              <button
                key={option.senseId}
                type="button"
                onClick={() => {
                  setChoices({ ...choices, [choosing]: option.senseId });
                  setChoosing(null);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted",
                  option.senseId === previews[choosing]!.senseId && "bg-accent font-medium",
                )}
              >
                <span className="flex-1">{option.meaning}</span>
                {option.owned && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {ta("owned")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** Tiến độ việc nhập gần nhất (đang chạy, đang chờ ngày mai, đã xong). */
function ImportProgressCard({ record }: { record: ImportRecord }) {
  const t = useTranslations("addWord.file");
  const progress = importProgress(record);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 100;
  const finished = record.status === "done" || record.status === "failed";
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" aria-live="polite">
      <h2 className="font-semibold">
        {record.status === "done"
          ? t("doneTitle", { file: record.fileName })
          : t("progressTitle", { file: record.fileName, notebook: record.notebookName })}
      </h2>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        {record.status === "done"
          ? t("doneBody", {
              added: progress.added,
              preparing: progress.preparing,
              skipped: progress.skipped + progress.failed,
            })
          : t("progress", { ...progress })}
      </p>
      {record.status === "waiting" && (
        <p className="text-sm">{t("waiting", { pending: progress.pending })}</p>
      )}
      {record.reason === "premium" && (
        <p className="text-sm text-destructive">{t("premiumStopped")}</p>
      )}
      {finished ? (
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => void getLocalDb().imports.delete(record.id)}
        >
          {t("dismiss")}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t("leaveHint")}</p>
      )}
    </section>
  );
}
