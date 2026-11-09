"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, FileSpreadsheet, Keyboard, Link2, Mic, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GUEST_OWNER, defaultNotebookId } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { getOrCreateDefaultNotebook, openSlotsToday } from "@/lib/db/repo";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";
import { ArticleEntry } from "./article-entry";
import { BulkEntry } from "./bulk-entry";
import { FileEntry } from "./file-entry";
import { PhotoEntry } from "./photo/photo-entry";
import { DEFAULT_LANGUAGE, languagePack, type EntryTab } from "@/lib/lang";
import { learningLanguage } from "@/lib/lang/filter";
import type { Language } from "@/lib/schema/word";
import { VoiceEntry } from "./voice-entry";
import { PremiumSheet } from "./premium-sheet";
import { PreparingList } from "./preparing-list";
import { SingleEntry } from "./single-entry";

const LAST_NOTEBOOK_KEY = "ww_last_notebook";

function readLastNotebook(): string | null {
  try {
    return localStorage.getItem(LAST_NOTEBOOK_KEY);
  } catch {
    return null;
  }
}

function saveLastNotebook(id: string) {
  try {
    localStorage.setItem(LAST_NOTEBOOK_KEY, id);
  } catch {
    // Không nhớ được sổ gần nhất: lần sau dùng "Sổ của tôi".
  }
}

export type EntryContext = {
  owner: string;
  signedIn: boolean;
  online: boolean;
  notebookId: string;
  notebookName: string;
  ownedSenseIds: Set<string>;
  /** Nghĩa đã có trong sổ đích. */
  inNotebookSenseIds: Set<string>;
  openSlots: number;
  dailyLimit: number;
  /** Ngôn ngữ đang học. */
  language: Language;
  /** Giọng Mỹ/Anh trong Cài đặt (nhận dạng giọng nói). */
  accent: "us" | "uk";
  /** Trình độ trong Cài đặt (tab Ảnh bỏ từ quá dễ khi tự chọn). */
  cefrLevel: string | null;
  onLimit: (plan: "free" | "premium", limit: number) => void;
};

export function AddWordScreen({ initialNotebookId }: { initialNotebookId: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const owner = useOwner();
  const online = useOnlineStatus();
  const [chosen, setChosen] = useState<string | null>(initialNotebookId);
  const [bulkText, setBulkText] = useState<string | null>(null);
  const [chosenTab, setTab] = useState<EntryTab>("typed");
  const [limit, setLimit] = useState<{ plan: "free" | "premium"; limit: number } | null>(null);

  const data = useLiveQuery(async () => {
    if (!owner) return undefined;
    const db = getLocalDb();
    const [notebooks, userWords, entries, settings, slots] = await Promise.all([
      db.notebooks.where("user_id").equals(owner).toArray(),
      db.user_words.where("user_id").equals(owner).toArray(),
      db.notebook_entries.where("user_id").equals(owner).toArray(),
      db.user_settings.get(owner),
      openSlotsToday(db, owner),
    ]);
    const language = learningLanguage(settings?.target_language);
    return {
      language,
      notebooks: notebooks.filter((n) => n.language === language),
      userWords,
      entries,
      dailyLimit: settings?.daily_new_limit ?? 10,
      accent: settings?.accent === "uk" ? ("uk" as const) : ("us" as const),
      cefrLevel: settings?.cefr_level ?? null,
      slots,
    };
  }, [owner]);

  const language = data?.language;
  const tabs = languagePack(language ?? DEFAULT_LANGUAGE).entryTabs;
  const tab = tabs.includes(chosenTab) ? chosenTab : "typed";

  // Người dùng bỏ qua 5 từ khởi đầu thì chưa có "Sổ của tôi".
  useEffect(() => {
    if (owner && language) {
      void getOrCreateDefaultNotebook(
        getLocalDb(),
        owner,
        t("onboarding.defaultNotebook"),
        language,
      );
    }
  }, [owner, t, language]);

  const notebooks = useMemo(
    () => (data?.notebooks ?? []).filter((n) => !n.deleted_at && !n.is_archived),
    [data],
  );
  const preferred = chosen ?? readLastNotebookSafe();
  const notebook =
    notebooks.find((n) => n.id === preferred) ??
    notebooks.find((n) => owner && n.id === defaultNotebookId(owner, data?.language)) ??
    notebooks[0];

  const context = useMemo<EntryContext | null>(() => {
    if (!owner || !data || !notebook) return null;
    const live = data.userWords.filter((u) => !u.deleted_at);
    const inNotebook = new Set(
      data.entries
        .filter((e) => !e.deleted_at && e.notebook_id === notebook.id)
        .map((e) => e.user_word_id),
    );
    return {
      owner,
      signedIn: owner !== GUEST_OWNER,
      online,
      notebookId: notebook.id,
      notebookName: notebook.name,
      ownedSenseIds: new Set(live.map((u) => u.sense_id)),
      inNotebookSenseIds: new Set(live.filter((u) => inNotebook.has(u.id)).map((u) => u.sense_id)),
      // Ngôn ngữ chưa có phiên ôn: từ mới nằm ở Sắp học, không học trong hôm nay.
      openSlots: languagePack(data.language).hasReview ? data.slots : 0,
      dailyLimit: data.dailyLimit,
      language: data.language,
      accent: data.accent,
      cefrLevel: data.cefrLevel,
      onLimit: (plan, max) => setLimit({ plan, limit: max }),
    };
  }, [owner, data, notebook, online]);

  return (
    <div className="flex flex-col gap-3 pb-40">
      <header className="flex h-14 items-center gap-1">
        <button
          type="button"
          aria-label={t("addWord.close")}
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-5" aria-hidden />
        </button>
        <h1 className="flex-1 text-xl font-extrabold">{t("add.title")}</h1>
      </header>

      {notebook && (
        <label className="flex items-center gap-2 rounded-2xl bg-card py-1 pr-1 pl-4 text-sm lift">
          <span className="shrink-0 text-muted-foreground">{t("addWord.notebook")}</span>
          <select
            aria-label={t("addWord.notebookLabel")}
            value={notebook.id}
            onChange={(e) => {
              setChosen(e.target.value);
              saveLastNotebook(e.target.value);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-transparent px-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring"
          >
            {notebooks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div
        role="tablist"
        aria-label={t("addWord.tabsLabel")}
        className="grid auto-cols-fr grid-flow-col gap-2"
      >
        {tabs.map((id) => {
          const active = id === tab;
          const Icon = TAB_ICONS[id] ?? Keyboard;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "flex min-h-16 press-3d flex-col items-center justify-center gap-1 rounded-2xl text-xs leading-tight font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary text-primary-foreground [--press:var(--primary-shadow)]"
                  : "bg-card text-foreground [--press:var(--lift)]",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(`addWord.tabs.${id}`)}
            </button>
          );
        })}
      </div>

      {context && tab === "file" && <FileEntry context={context} />}
      {context && tab === "photo" && <PhotoEntry context={context} />}
      {context && tab === "url" && <ArticleEntry context={context} />}
      {context && tab === "voice" && (
        <VoiceEntry context={context} onTypeInstead={() => setTab("typed")} />
      )}
      {context &&
        tab === "typed" &&
        (bulkText !== null ? (
          <BulkEntry
            key={`${bulkText}:${context.notebookId}`}
            text={bulkText}
            context={context}
            onDone={() => setBulkText(null)}
          />
        ) : (
          <SingleEntry context={context} onPasteList={setBulkText} />
        ))}

      <PreparingList />

      {limit && <PremiumSheet {...limit} onClose={() => setLimit(null)} />}
    </div>
  );
}

const TAB_ICONS: Record<string, LucideIcon> = {
  typed: Keyboard,
  voice: Mic,
  photo: Camera,
  url: Link2,
  file: FileSpreadsheet,
};

function readLastNotebookSafe(): string | null {
  return typeof window === "undefined" ? null : readLastNotebook();
}
