"use client";

import { useState, type ClipboardEvent, type FormEvent } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { getLocalDb } from "@/lib/db/local";
import { addSensesToNotebook } from "@/lib/db/repo";
import { isMultiline } from "@/lib/entry/paste";
import { normalizeEntry } from "@/lib/entry/normalize";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { toWordSummary, type WordSummary } from "@/lib/words/api";
import { requestWord } from "@/lib/words/request-word";
import type { EntryContext } from "./add-word-screen";
import { cacheSenses, useWordSuggestions } from "./word-search";

type Picked = { word: WordSummary; typed: string; senseId: string };

const inputClass =
  "w-full rounded-xl border bg-background px-4 text-base focus-visible:outline-2 focus-visible:outline-ring";

/** Tab Gõ, một từ: gợi ý → chọn nghĩa → Thêm. Dán nhiều dòng thì chuyển sang xem trước hàng loạt. */
export function SingleEntry({
  context,
  onPasteList,
}: {
  context: EntryContext;
  onPasteList: (text: string) => void;
}) {
  const t = useTranslations("addWord");
  const tc = useTranslations("wordCard");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [contextSentence, setContextSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; login?: boolean } | null>(null);
  const suggestions = useWordSuggestions(getLocalDb(), picked ? "" : query, context.online);

  const owned = (word: WordSummary) => word.senses.every((s) => context.ownedSenseIds.has(s.id));
  const exact = suggestions.items.some((w) => w.lemma.toLowerCase() === query.trim().toLowerCase());

  function pick(word: WordSummary, typed = query) {
    const entry = normalizeEntry(
      { text: typed },
      { lemma: word.lemma, alternatives: [], words: [word] },
      context.inNotebookSenseIds,
    );
    const senseId =
      entry.status === "ready" || entry.status === "choose" ? entry.senseId : word.senses[0]!.id;
    setPicked({ word, typed, senseId });
    setMessage(null);
  }

  function reset() {
    setQuery("");
    setPicked(null);
    setContextSentence("");
  }

  async function requestNew() {
    const text = query.trim();
    if (!text) return;
    if (!getSupabaseEnv() || !context.online) {
      setMessage({ text: t("failed") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await requestWord(createClient(), {
        lemma: text,
        notebookId: context.signedIn ? context.notebookId : null,
        contextSentence: contextSentence.trim() || null,
        inputMethod: "typed",
      });
      switch (response.status) {
        case "ready":
          pick(toWordSummary(response.words[0]!), text);
          break;
        case "preparing":
          showToast({
            text: t("preparing", { word: response.lemma, notebook: context.notebookName }),
          });
          reset();
          break;
        case "login_required":
          setMessage({ text: t("loginRequired", { word: response.lemma }), login: true });
          break;
        case "limit_reached":
          context.onLimit(response.plan, response.dailyLimit);
          break;
      }
    } catch {
      setMessage({ text: t("failed") });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!picked) return;
    setBusy(true);
    try {
      const db = getLocalDb();
      const result = await addSensesToNotebook(
        db,
        context.owner,
        [{ senseId: picked.senseId, contextSentence: contextSentence.trim() || null }],
        { notebookId: context.notebookId, inputMethod: "typed" },
      );
      void cacheSenses(db, [picked.senseId]);
      const word = picked.word.lemma;
      const notebook = context.notebookName;
      showToast({
        text: result.skipped.length
          ? t("alreadyInNotebook", { word })
          : result.linked.length
            ? t("linked", { word, notebook })
            : t("added", { word, notebook }),
      });
      reset();
    } catch {
      setMessage({ text: t("failed") });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (picked) void add();
    else if (suggestions.items[0]) pick(suggestions.items[0]);
    else if (query.trim() && !suggestions.loading) void requestNew();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (isMultiline(text)) {
      event.preventDefault();
      onPasteList(text);
    }
  }

  const normalized =
    picked && picked.typed.trim().toLowerCase() !== picked.word.lemma.toLowerCase()
      ? t("normalized", { from: picked.typed.trim(), to: picked.word.lemma })
      : null;
  const senseOwned = picked ? context.ownedSenseIds.has(picked.senseId) : false;
  const when = senseOwned || context.openSlots > 0 ? t("today") : t("queued");

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="add-word-input">
        {t("inputLabel")}
      </label>
      <input
        id="add-word-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(null);
          setMessage(null);
        }}
        onPaste={onPaste}
        placeholder={t("inputPlaceholder")}
        autoFocus
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        lang="en"
        enterKeyHint={picked ? "done" : "search"}
        className={cn(inputClass, "h-14 text-lg")}
      />
      {!context.online && <p className="text-sm text-muted-foreground">{t("offline")}</p>}

      {!picked && query.trim() && (
        <ul aria-label={t("suggestions")} className="flex flex-col divide-y rounded-xl border">
          {suggestions.items.map((word) => (
            <li key={word.id}>
              <button
                type="button"
                onClick={() => pick(word)}
                className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="font-medium" lang="en">
                  {word.lemma}
                </span>
                <span className="text-xs text-muted-foreground">{tc(`posShort.${word.pos}`)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {word.senses[0]!.meaning_vi}
                </span>
                {owned(word) && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    {t("owned")}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!exact && !suggestions.loading && (
            <li>
              <button
                type="button"
                onClick={() => void requestNew()}
                disabled={busy}
                className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                {t("addNew", { word: query.trim() })}
              </button>
            </li>
          )}
        </ul>
      )}

      {picked && (
        <section className="flex flex-col gap-2 rounded-xl border p-3">
          <p className="flex items-baseline gap-2">
            <span className="text-lg font-semibold" lang="en">
              {picked.word.lemma}
            </span>
            <span className="text-sm text-muted-foreground">{tc(`pos.${picked.word.pos}`)}</span>
            {normalized && <span className="text-xs text-muted-foreground">({normalized})</span>}
          </p>
          {picked.word.senses.length > 1 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm">
                {t("chooseSense", { word: picked.word.lemma, count: picked.word.senses.length })}
              </legend>
              {picked.word.senses.map((sense) => (
                <label
                  key={sense.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="sense"
                    checked={picked.senseId === sense.id}
                    onChange={() => setPicked({ ...picked, senseId: sense.id })}
                    className="size-4 accent-primary"
                  />
                  <span className="flex-1 text-sm">{sense.meaning_vi}</span>
                  {context.ownedSenseIds.has(sense.id) && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {t("owned")}
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-sm">{picked.word.senses[0]!.meaning_vi}</p>
          )}
          <label className="flex flex-col gap-1.5 text-sm">
            {t("context")}
            <textarea
              value={contextSentence}
              onChange={(e) => setContextSentence(e.target.value)}
              maxLength={500}
              rows={2}
              lang="en"
              className="rounded-lg border bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring"
            />
          </label>
        </section>
      )}

      {message && (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p className="text-sm text-destructive">{message.text}</p>
          {message.login && (
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/login?next=%2Fadd">{t("signIn")}</Link>
            </Button>
          )}
        </div>
      )}

      {!query && <p className="text-sm text-muted-foreground">{t("pasteHint")}</p>}

      {picked && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom,0px)]">
          <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
            <span className="flex-1 text-sm text-muted-foreground">
              {t("summaryOne", { when })}
            </span>
            <Button type="submit" className="min-h-11 px-6" disabled={busy}>
              {busy ? t("adding") : t("add")}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
