"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { cleanSurface } from "@/lib/entry/lemma";
import {
  normalizeEntry,
  summarizeEntries,
  type NormalizedEntry,
  type Resolution,
} from "@/lib/entry/normalize";
import { suggestSpellings } from "@/lib/ocr/request-ocr";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { resolveWords } from "@/lib/words/request-word";
import { Highlighted } from "@/features/words/word-card/parts";
import { addEntries } from "../add-entries";
import type { EntryContext } from "../add-word-screen";

const CHUNK = 50;

export type ReviewItem = { text: string; context: string };

type Row = { id: number; text: string; original: string; context: string };

const keyOf = (text: string) => cleanSurface(text);

function without<T>(record: Record<number, T>, id: number): Record<number, T> {
  const next = { ...record };
  delete next[id];
  return next;
}

/**
 * Kiểm tra các từ đã chọn trên ảnh: sửa chính tả (gợi ý từ gần nhất trong kho), xem câu gốc, chọn
 * nghĩa, rồi thêm (cách nhập "photo", câu gốc làm câu đã gặp, kèm ảnh nếu người dùng giữ ảnh).
 */
export function PhotoReview({
  items,
  context,
  uploadImage,
  onBack,
  onDone,
}: {
  items: ReviewItem[];
  context: EntryContext;
  /** Tải ảnh giữ làm ngữ cảnh khi bấm Thêm; null khi không giữ ảnh. */
  uploadImage: (() => Promise<string | null>) | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("addWord.photo");
  const tb = useTranslations("addWord.bulk");
  const ta = useTranslations("addWord");
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item, id) => ({ id, text: item.text, original: item.text, context: item.context })),
  );
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [resolutions, setResolutions] = useState<Map<string, Resolution>>(new Map());
  const [failed, setFailed] = useState(false);
  const [suggestions, setSuggestions] = useState<Map<string, string>>(new Map());
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [choosing, setChoosing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const missing = useMemo(
    () => [...new Set(rows.map((r) => keyOf(r.text)))].filter((k) => k && !resolutions.has(k)),
    [rows, resolutions],
  );

  useEffect(() => {
    if (missing.length === 0 || !context.online) return;
    let cancelled = false;
    void (async () => {
      try {
        const found = new Map<string, Resolution>();
        for (let i = 0; i < missing.length; i += CHUNK) {
          const chunk = missing.slice(i, i + CHUNK);
          const { items: resolved } = await resolveWords(
            createClient(),
            chunk.map((k) => k.slice(0, 64)),
          );
          chunk.forEach((k, j) => resolved[j] && found.set(k, resolved[j]!));
        }
        if (cancelled) return;
        setFailed(false);
        setResolutions((prev) => new Map([...prev, ...found]));
        // Chữ chưa có trong kho có thể do máy đọc nhầm → hỏi "Có phải …?".
        const unknown = [...found].filter(([, r]) => r.words.length === 0).map(([k]) => k);
        if (unknown.length) {
          const more = await suggestSpellings(createClient(), unknown);
          if (!cancelled && more.size) setSuggestions((prev) => new Map([...prev, ...more]));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missing, context.online]);

  const entries = useMemo<(NormalizedEntry | null)[]>(() => {
    const seen = new Set<string>();
    return rows.map((row) => {
      const resolution = resolutions.get(keyOf(row.text));
      if (!resolution) return null;
      const entry = normalizeEntry(
        { text: row.text, context: row.context },
        resolution,
        context.inNotebookSenseIds,
      );
      const key = entry.status === "invalid" ? `#${row.id}` : entry.lemma;
      if (seen.has(key)) return { ...entry, status: "duplicate", options: [] } as NormalizedEntry;
      seen.add(key);
      const choice = choices[row.id];
      if ((entry.status === "choose" || entry.status === "ready") && choice) {
        return { ...entry, senseId: choice };
      }
      return entry;
    });
  }, [rows, resolutions, context.inNotebookSenseIds, choices]);

  const ready = entries.every((e) => e !== null);
  const done = entries.filter((e): e is NormalizedEntry => e !== null);
  const summary = summarizeEntries(done, context.openSlots);
  const total = summary.toAdd + summary.newWords;

  function commitText(row: Row, text: string) {
    const value = text.replace(/\s+/g, " ").trim();
    setDrafts((prev) => without(prev, row.id));
    if (!value || value === row.text) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, text: value } : r)));
    setChoices((prev) => without(prev, row.id));
  }

  async function addAll() {
    setBusy(true);
    try {
      let image: string | null = null;
      if (uploadImage) {
        image = await uploadImage();
        if (!image) showToast({ text: t("imageFailed") });
      }
      const { added, preparing, skipped } = await addEntries(done, context, {
        inputMethod: "photo",
        source: null,
        contextImageUrl: image,
      });
      showToast({
        text: skipped ? tb("resultLimit", { added, skipped }) : tb("result", { added, preparing }),
      });
      onDone();
    } catch {
      showToast({ text: ta("failed") });
    } finally {
      setBusy(false);
    }
  }

  const choosingEntry =
    choosing !== null ? entries[rows.findIndex((r) => r.id === choosing)] : null;

  return (
    <section className="flex flex-col gap-3 pb-40">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("backToPicker")}
          onClick={onBack}
          className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h2 className="font-semibold">{t("reviewTitle", { count: rows.length })}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{t("reviewHint")}</p>

      {(!context.online || failed) && (
        <p className="text-sm text-destructive" role="alert">
          {tb("needOnline")}
        </p>
      )}

      <ul aria-label={t("reviewLabel")} className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const entry = entries[i];
          const option =
            entry && (entry.status === "ready" || entry.status === "choose")
              ? entry.options.find((o) => o.senseId === entry.senseId)
              : undefined;
          const suggestion = entry?.status === "new" ? suggestions.get(keyOf(row.text)) : undefined;
          const skipped = entry?.status === "duplicate" || entry?.status === "invalid";
          return (
            <li
              key={row.id}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border p-3",
                suggestion &&
                  "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950",
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={t("wordInput", { index: i + 1 })}
                  value={drafts[row.id] ?? row.text}
                  onChange={(e) => setDrafts({ ...drafts, [row.id]: e.target.value })}
                  onBlur={(e) => commitText(row, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  maxLength={64}
                  lang="en"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(
                    "min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 font-semibold focus-visible:outline-2 focus-visible:outline-ring",
                    skipped && "text-muted-foreground line-through",
                  )}
                />
                <button
                  type="button"
                  aria-label={t("remove", { word: row.text })}
                  onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {!entry ? (
                  <span>{tb("checking")}</span>
                ) : (
                  <>
                    {entry.changed && entry.status !== "invalid" && (
                      <span>
                        {t("fromSurface", { surface: entry.surface, lemma: entry.lemma })}
                      </span>
                    )}
                    <span className="min-w-0 truncate">
                      {entry.status === "duplicate"
                        ? t("inNotebook")
                        : entry.status === "invalid" || entry.status === "unresolved"
                          ? tb("invalid")
                          : entry.status === "new"
                            ? tb("new")
                            : option?.meaning}
                    </span>
                    {entry.status === "choose" && (
                      <button
                        type="button"
                        onClick={() => setChoosing(row.id)}
                        className="min-h-11 shrink-0 rounded-full border px-3 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {tb("senses", { count: entry.options.length })}
                      </button>
                    )}
                  </>
                )}
              </div>

              {suggestion && (
                <button
                  type="button"
                  onClick={() => commitText(row, suggestion)}
                  className="min-h-11 self-start text-left text-sm text-amber-900 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring dark:text-amber-100"
                >
                  {t.rich("didYouMean", {
                    word: suggestion,
                    b: (chunks) => <b className="underline">{chunks}</b>,
                  })}
                </button>
              )}

              {row.context && (
                <p className="text-sm text-muted-foreground" lang="en">
                  “<Highlighted text={row.context} terms={[row.original, row.text]} />”
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
          {ready && (
            <p className="text-sm">
              <span className="font-semibold">{tb("summaryTitle", { count: total })}</span>
              <br />
              <span className="text-muted-foreground">
                {tb("summary", {
                  today: summary.today,
                  queued: summary.queued,
                  limit: context.dailyLimit,
                  duplicates: summary.duplicates,
                })}
              </span>
            </p>
          )}
          <Button
            className="min-h-11"
            disabled={busy || !ready || total === 0 || !context.online}
            onClick={() => void addAll()}
          >
            {busy ? ta("adding") : tb("addAll", { count: total })}
          </Button>
        </div>
      </div>

      {choosingEntry && choosingEntry.status === "choose" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setChoosing(null)}
          title={tb("choose", { word: choosingEntry.lemma })}
        >
          <div className="flex flex-col gap-1">
            {choosingEntry.options.map((option) => (
              <button
                key={option.senseId}
                type="button"
                onClick={() => {
                  setChoices({ ...choices, [choosing!]: option.senseId });
                  setChoosing(null);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted",
                  option.senseId === choosingEntry.senseId && "bg-accent font-medium",
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
