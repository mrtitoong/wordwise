"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { columnName, readTableFile, type Table } from "@/features/import/read-table";
import {
  linesFromText,
  MAX_DOCUMENT_CHARS,
  MAX_LIST_LINES,
  rowsFromTable,
  type SourceInput,
} from "@/lib/admin/lists";
import {
  IMPORT_FIELDS,
  detectColumns,
  looksLikeHeader,
  readRows,
  type ColumnMapping,
  type ImportField,
} from "@/lib/entry/file-import";
import { cn } from "@/lib/utils";
import { addSource, deleteSource } from "./actions";
import { readDocument, type DocumentResult } from "./document-text";

export type SourceSummary = {
  id: string;
  kind: string;
  name: string | null;
  item_count: number;
};

type Tab = "table" | "lines" | "document";

/** Nguồn từ của danh sách (ux-flows §3.13): bảng CSV/Excel có ánh xạ cột, dán văn bản, bài đọc. */
export function SourcesPanel({
  listId,
  sources,
  locked,
}: {
  listId: string;
  sources: SourceSummary[];
  locked: boolean;
}) {
  const t = useTranslations("admin.sources");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("table");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function add(source: SourceInput): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    const result = await addSource(listId, source);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="sources-heading" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">
                <b>{t(`kind.${s.kind as "rows" | "lines" | "document"}`)}</b>
                {s.name && ` · ${s.name}`}
                {s.kind !== "document" && ` · ${t("items", { count: s.item_count })}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                disabled={locked || busy}
                aria-label={t("delete", { name: s.name ?? t(`kind.${s.kind as "rows"}`) })}
                onClick={async () => {
                  setBusy(true);
                  await deleteSource(listId, s.id);
                  setBusy(false);
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {locked ? (
        <p className="rounded-xl bg-muted p-3 text-sm">{t("locked")}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <div role="tablist" className="flex flex-wrap gap-2">
            {(["table", "lines", "document"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm",
                  tab === k ? "border-primary bg-accent font-medium" : "hover:bg-muted",
                )}
              >
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>
          {tab === "table" && <TableSource busy={busy} onAdd={add} />}
          {tab === "lines" && <LinesSource busy={busy} onAdd={add} />}
          {tab === "document" && <DocumentSource busy={busy} onAdd={add} />}
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("failed")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type SourceProps = { busy: boolean; onAdd: (source: SourceInput) => Promise<boolean> };

function TableSource({ busy, onAdd }: SourceProps) {
  const t = useTranslations("admin.sources");
  const [fileName, setFileName] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [sheet, setSheet] = useState(0);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const table = tables[sheet];
  const width = Math.max(0, ...(table?.rows.slice(0, 20).map((r) => r.length) ?? [0]));
  const parsed = useMemo(
    () => (table && mapping.includes("word") ? readRows(table.rows, mapping, hasHeader) : []),
    [table, mapping, hasHeader],
  );
  const rows = rowsFromTable(parsed);

  function choose(next: Table[], index: number) {
    const first = next[index]?.rows[0] ?? [];
    const header = looksLikeHeader(first);
    setSheet(index);
    setHasHeader(header);
    setMapping(header ? detectColumns(first) : first.map((_, i) => (i === 0 ? "word" : null)));
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg border px-4 text-sm hover:bg-muted">
        {fileName ?? t("file")}
        <input
          type="file"
          accept=".csv,.xlsx,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const read = (await readTableFile(file).catch(() => [])).filter((s) => s.rows.length);
            setFileName(file.name);
            setTables(read);
            choose(read, 0);
          }}
        />
      </label>
      {table && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {tables.length > 1 && (
              <label className="flex items-center gap-2">
                {t("sheet")}
                <select
                  value={sheet}
                  onChange={(e) => choose(tables, Number(e.target.value))}
                  className="min-h-11 rounded-lg border bg-background px-2"
                >
                  {tables.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="size-5"
              />
              {t("hasHeader")}
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-2 text-sm">
            <legend className="mb-1 font-medium">{t("mapping")}</legend>
            {Array.from({ length: width }, (_, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {columnName(i)}
                  {hasHeader && table.rows[0]?.[i] ? ` · ${table.rows[0][i]}` : ""}
                </span>
                <select
                  value={mapping[i] ?? ""}
                  onChange={(e) => {
                    const value = (e.target.value || null) as ImportField | null;
                    setMapping(
                      Array.from({ length: width }, (_, j) =>
                        j === i
                          ? value
                          : mapping[j] === value && value
                            ? null
                            : (mapping[j] ?? null),
                      ),
                    );
                  }}
                  className="min-h-11 rounded-lg border bg-background px-2"
                >
                  <option value="">{t("skip")}</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {t(`fields.${f}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
          {!mapping.includes("word") ? (
            <p className="text-sm text-destructive">{t("needWord")}</p>
          ) : (
            <p className="text-sm" role="status">
              {t("valid", { valid: rows.length, skipped: parsed.length - rows.length })}
              {rows.length > 0 &&
                ` · ${t("preview")}: ${rows
                  .slice(0, 5)
                  .map((r) => r.word)
                  .join(", ")}`}
            </p>
          )}
          <Button
            className="min-h-11 w-fit"
            disabled={busy || rows.length === 0}
            onClick={async () => {
              const ok = await onAdd({
                kind: "rows",
                name: fileName,
                rows: rows.slice(0, MAX_LIST_LINES),
              });
              if (ok) setTables([]);
            }}
          >
            {busy ? t("adding") : t("add")}
          </Button>
        </>
      )}
    </div>
  );
}

function LinesSource({ busy, onAdd }: SourceProps) {
  const t = useTranslations("admin.sources");
  const [text, setText] = useState("");
  const { rows, truncated } = useMemo(() => linesFromText(text), [text]);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("pastePlaceholder")}
        aria-label={t("tabs.lines")}
        className="rounded-lg border bg-background p-3 text-base"
      />
      <p className="text-sm" role="status">
        {t("pasteCount", { count: rows.length })}
        {truncated && ` · ${t("truncated", { max: MAX_LIST_LINES })}`}
      </p>
      <Button
        className="min-h-11 w-fit"
        disabled={busy || rows.length === 0}
        onClick={async () => {
          if (await onAdd({ kind: "lines", name: null, rows })) setText("");
        }}
      >
        {busy ? t("adding") : t("add")}
      </Button>
    </div>
  );
}

function DocumentSource({ busy, onAdd }: SourceProps) {
  const t = useTranslations("admin.sources");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<DocumentResult | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg border px-4 text-sm hover:bg-muted">
        {fileName ?? t("document")}
        <input
          type="file"
          accept="application/pdf,.pdf,image/*,.txt,.md,text/plain"
          className="sr-only"
          disabled={!!reading}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setFileName(file.name);
            setResult(null);
            setReading({ done: 0, total: 1 });
            const read = await readDocument(file, (done, total) =>
              setReading({ done, total }),
            ).catch((): DocumentResult => ({ ok: false, error: "unsupported" }));
            setReading(null);
            setResult(read);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("documentHint")}</p>
      {reading && (
        <p role="status" className="text-sm">
          {t("reading", reading)}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="text-sm text-destructive">
          {t(`readErrors.${result.error}`)}
        </p>
      )}
      {result?.ok && (
        <>
          <p role="status" className="text-sm">
            {t("readDone", {
              chars: result.text.length,
              pages: result.pages,
              ocr: result.ocrPages,
            })}
            {result.truncated && ` ${t("readTruncated")}`}
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {result.text.slice(0, 2000)}
          </pre>
          <Button
            className="min-h-11 w-fit"
            disabled={busy}
            onClick={async () => {
              const ok = await onAdd({
                kind: "document",
                name: fileName,
                text: result.text.slice(0, MAX_DOCUMENT_CHARS),
              });
              if (ok) setResult(null);
            }}
          >
            {busy ? t("adding") : t("add")}
          </Button>
        </>
      )}
    </div>
  );
}
