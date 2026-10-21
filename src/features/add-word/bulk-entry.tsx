"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { getLocalDb } from "@/lib/db/local";
import { addSensesToNotebook } from "@/lib/db/repo";
import { normalizeEntry, summarizeEntries, type NormalizedEntry } from "@/lib/entry/normalize";
import { parsePastedText } from "@/lib/entry/paste";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import type { ResolveResponse } from "@/lib/words/api";
import { requestWord, resolveWords } from "@/lib/words/request-word";
import type { EntryContext } from "./add-word-screen";
import { cacheSenses } from "./word-search";

const CHUNK = 50;

type Resolved = ResolveResponse["items"][number] | null;

/** Dán nhiều dòng: tra cả danh sách → xem trước (từ gốc, trùng, chọn nghĩa) → thêm hàng loạt. */
export function BulkEntry({
  text,
  context,
  onDone,
}: {
  text: string;
  context: EntryContext;
  onDone: () => void;
}) {
  const t = useTranslations("addWord.bulk");
  const ta = useTranslations("addWord");
  const parsed = useMemo(() => parsePastedText(text), [text]);
  const [resolved, setResolved] = useState<Resolved[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [choosing, setChoosing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getSupabaseEnv() || !context.online) return;
    let cancelled = false;
    void (async () => {
      try {
        const words = parsed.lines.map((l) => l.word.slice(0, 64));
        const all: Resolved[] = [];
        for (let i = 0; i < words.length; i += CHUNK) {
          const { items } = await resolveWords(createClient(), words.slice(i, i + CHUNK));
          all.push(...items);
        }
        if (!cancelled) setResolved(all);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, context.online]);

  const entries = useMemo<NormalizedEntry[] | null>(() => {
    if (!resolved) return null;
    const seen = new Set<string>();
    return parsed.lines.map((line, i) => {
      const entry = normalizeEntry(
        { text: line.word, note: line.note },
        resolved[i] ?? null,
        context.ownedSenseIds,
      );
      // Hai dòng ra cùng từ gốc (running, ran → run): chỉ thêm một lần.
      const key = entry.status === "invalid" ? `#${i}` : entry.lemma;
      if (seen.has(key)) return { ...entry, status: "duplicate", options: [] } as NormalizedEntry;
      seen.add(key);
      if ((entry.status === "choose" || entry.status === "ready") && choices[i]) {
        return { ...entry, senseId: choices[i] };
      }
      return entry;
    });
  }, [resolved, parsed, context.ownedSenseIds, choices]);

  const counted = useMemo(
    () => (entries ?? []).filter((e) => e.status !== "new" || context.signedIn),
    [entries, context.signedIn],
  );
  const summary = summarizeEntries(counted, context.openSlots);
  const total = summary.toAdd + summary.newWords;

  async function addAll() {
    if (!entries) return;
    setBusy(true);
    const db = getLocalDb();
    const ready = entries.flatMap((e) =>
      e.status === "ready" || e.status === "choose" ? [{ senseId: e.senseId }] : [],
    );
    let added = 0;
    try {
      if (ready.length) {
        const result = await addSensesToNotebook(db, context.owner, ready, {
          notebookId: context.notebookId,
          inputMethod: "typed",
          source: "paste",
        });
        added = result.added.length + result.linked.length;
        void cacheSenses(
          db,
          ready.map((r) => r.senseId),
        );
      }
      let preparing = 0;
      let skipped = 0;
      if (context.signedIn) {
        const fresh = entries.filter((e) => e.status === "new");
        for (const [i, entry] of fresh.entries()) {
          const response = await requestWord(createClient(), {
            lemma: entry.lemma,
            notebookId: context.notebookId,
            inputMethod: "typed",
          });
          if (response.status === "limit_reached") {
            skipped = fresh.length - i;
            context.onLimit(response.plan, response.dailyLimit);
            break;
          }
          if (response.status === "preparing") preparing++;
          if (response.status === "ready") {
            const senseId = response.words[0]!.senseIds[0]!;
            const result = await addSensesToNotebook(db, context.owner, [{ senseId }], {
              notebookId: context.notebookId,
              inputMethod: "typed",
              source: "paste",
            });
            added += result.added.length + result.linked.length;
            void cacheSenses(db, [senseId]);
          }
        }
      }
      showToast({
        text: skipped ? t("resultLimit", { added, skipped }) : t("result", { added, preparing }),
      });
      onDone();
    } catch {
      showToast({ text: ta("failed") });
    } finally {
      setBusy(false);
    }
  }

  const choosingEntry = choosing !== null ? entries?.[choosing] : undefined;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("title", { count: parsed.lines.length })}</h2>
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("back")}
        </button>
      </div>
      {parsed.truncated && <p className="text-sm text-muted-foreground">{t("truncated")}</p>}

      {!context.online || !getSupabaseEnv() || failed ? (
        <p className="text-sm text-destructive" role="alert">
          {t("needOnline")}
        </p>
      ) : !entries ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("checking")}
        </p>
      ) : (
        <ul aria-label={t("listLabel")} className="flex flex-col divide-y rounded-xl border">
          {entries.map((entry, i) => {
            const option =
              entry.status === "ready" || entry.status === "choose"
                ? entry.options.find((o) => o.senseId === entry.senseId)
                : undefined;
            const skippedRow =
              entry.status === "duplicate" ||
              entry.status === "invalid" ||
              (entry.status === "new" && !context.signedIn);
            return (
              <li
                key={i}
                className={cn(
                  "flex min-h-12 items-center gap-2 px-3 py-2",
                  skippedRow && "text-muted-foreground",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("font-medium", skippedRow && "line-through")} lang="en">
                    {entry.changed
                      ? `${entry.surface} → ${entry.lemma}`
                      : entry.surface || parsed.lines[i]!.word}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {entry.status === "duplicate"
                      ? t("duplicate")
                      : entry.status === "invalid" || entry.status === "unresolved"
                        ? t("invalid")
                        : entry.status === "new"
                          ? t(context.signedIn ? "new" : "newGuest")
                          : option?.meaning}
                  </span>
                </span>
                {entry.status === "choose" && (
                  <button
                    type="button"
                    onClick={() => setChoosing(i)}
                    className="min-h-11 shrink-0 rounded-full border px-3 text-xs text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {t("senses", { count: entry.options.length })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {entries && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
            <p className="text-sm">
              <span className="font-semibold">{t("summaryTitle", { count: total })}</span>
              <br />
              <span className="text-muted-foreground">
                {t("summary", {
                  today: summary.today,
                  queued: summary.queued,
                  limit: context.dailyLimit,
                  duplicates: summary.duplicates,
                })}
              </span>
            </p>
            <Button
              className="min-h-11"
              disabled={busy || total === 0}
              onClick={() => void addAll()}
            >
              {busy ? ta("adding") : t("addAll", { count: total })}
            </Button>
          </div>
        </div>
      )}

      {choosingEntry && choosingEntry.status === "choose" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setChoosing(null)}
          title={t("choose", { word: choosingEntry.lemma })}
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
