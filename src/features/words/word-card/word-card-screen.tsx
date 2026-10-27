"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs } from "radix-ui";
import { showToast } from "@/components/ui/toast";
import { getLocalDb } from "@/lib/db/local";
import { addSensesToDefaultNotebook, updateUserWord } from "@/lib/db/repo";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";
import { serializeAdditions, type UserAdditions } from "@/lib/words/user-additions";
import { buildWordCard, type WordCardTab } from "@/lib/words/word-card";
import { fetchWordToLocal, readLocalWord, readPersonalRows } from "../word-data";
import { AdditionSheet, resolveTarget } from "./addition-sheet";
import { CardHeader } from "./card-header";
import { ExamplesTab } from "./examples-tab";
import { MeaningTab } from "./meaning-tab";
import { MemoryTab } from "./memory-tab";
import { ChipSheet, ImageSheet, MeaningSheet, ReportSheet, SessionChipSheet } from "./other-sheets";
import { CardProvider, type SheetState } from "./parts";
import { RelatedTab } from "./related-tab";
import { UsageTab } from "./usage-tab";
import { WordCardSkeleton } from "./skeleton";
import { radioGroupKeys } from "@/components/ui/radio-keys";

const VIEW_KEY = "ww_word_view";

function readQuickView(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) === "quick";
  } catch {
    return false;
  }
}

function saveQuickView(quick: boolean) {
  try {
    localStorage.setItem(VIEW_KEY, quick ? "quick" : "full");
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ không nhớ được lựa chọn.
  }
}

/** Thanh trên của thẻ từ: quay lại + công tắc Xem nhanh / Đầy đủ. */
export function CardTopBar({
  quick,
  onQuickChange,
}: {
  quick?: boolean;
  onQuickChange?: (quick: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
      <div className="flex h-14 items-center gap-2">
        <button
          type="button"
          aria-label={t("nav.back")}
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/notebooks"))}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <span className="flex-1" />
        {onQuickChange && (
          <div
            role="radiogroup"
            onKeyDown={radioGroupKeys}
            aria-label={t("wordCard.viewMode")}
            className="flex rounded-full bg-muted p-0.5 text-sm"
          >
            {[false, true].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={quick === value}
                onClick={() => onQuickChange(value)}
                className={cn(
                  "min-h-11 rounded-full px-3 focus-visible:outline-2 focus-visible:outline-ring",
                  quick === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground",
                )}
              >
                {t(value ? "wordCard.quickView" : "wordCard.fullView")}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

export function WordCardScreen({ wordId }: { wordId: string }) {
  // Lần render đầu (cả ở server) chưa có dữ liệu thẻ nên đọc lựa chọn ngay không lệch hydrate.
  const [quick, setQuick] = useState(() => typeof window !== "undefined" && readQuickView());
  const [tab, setTab] = useState<WordCardTab>("meaning");
  const changeQuick = (value: boolean) => {
    setQuick(value);
    saveQuickView(value);
    if (value) setTab("meaning");
  };
  return (
    <WordCardBody
      wordId={wordId}
      quick={quick}
      tab={tab}
      onTabChange={setTab}
      topBar={(ready) =>
        ready ? <CardTopBar quick={quick} onQuickChange={changeQuick} /> : <CardTopBar />
      }
    />
  );
}

/**
 * Nội dung thẻ từ (đầu thẻ, 5 tab, các bảng thêm/sửa/báo lỗi). Trang /words/[id] có thanh trên;
 * phiên ôn nhúng thẻ khi học từ mới (`inSession`: không có nút rời phiên, tab không dính đỉnh).
 */
export function WordCardBody({
  wordId,
  quick = false,
  tab: controlledTab,
  onTabChange,
  topBar,
  inSession = false,
  autoPlay = null,
}: {
  wordId: string;
  quick?: boolean;
  tab?: WordCardTab;
  onTabChange?: (tab: WordCardTab) => void;
  /** Thanh trên (null: không có). `ready` = đã có nội dung thẻ. */
  topBar?: (ready: boolean) => ReactNode;
  inSession?: boolean;
  autoPlay?: "us" | "uk" | null;
}) {
  const t = useTranslations();
  const owner = useOwner();
  const online = useOnlineStatus();
  const [ownTab, setOwnTab] = useState<WordCardTab>("meaning");
  const tab = controlledTab ?? ownTab;
  const setTab = onTabChange ?? setOwnTab;
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  const word = useLiveQuery(() => readLocalWord(getLocalDb(), wordId), [wordId]);
  const senseKey = word?.senseIds.join(",") ?? "";
  const personal = useLiveQuery(
    async () => (owner && word ? readPersonalRows(getLocalDb(), owner, word.senseIds) : undefined),
    [owner, senseKey],
  );
  const accent = useLiveQuery(
    async () => (owner ? (await getLocalDb().user_settings.get(owner))?.accent : undefined),
    [owner],
  );

  // Chưa có trong máy: tải từ server (lại khi có mạng trở lại).
  useEffect(() => {
    if (word !== null || !online) return;
    let cancelled = false;
    void fetchWordToLocal(getLocalDb(), wordId).then((ok) => {
      if (!cancelled) setFetchFailed(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, [word, wordId, online]);

  const view = useMemo(
    () =>
      word ? buildWordCard(word, personal ?? { userWords: [], entries: [], notebooks: [] }) : null,
    [word, personal],
  );

  const addSense = useCallback(
    (senseId: string) => {
      if (!owner) return;
      const notebook = t("onboarding.defaultNotebook");
      void addSensesToDefaultNotebook(
        getLocalDb(),
        owner,
        [senseId],
        notebook,
        "typed",
        "word_card",
      ).then(() => showToast({ text: t("wordCard.added", { notebook }) }));
    },
    [owner, t],
  );

  if (!view) {
    const message =
      word === undefined || !fetchFailed
        ? null
        : online
          ? t("wordCard.state.notFound")
          : t("wordCard.state.offline");
    return (
      <>
        {topBar?.(false)}
        {message ? (
          <p className="py-12 text-center text-muted-foreground" role="alert">
            {message}
          </p>
        ) : (
          <WordCardSkeleton label={t("wordCard.state.loading")} />
        )}
      </>
    );
  }

  const save = (userWordId: string, patch: Parameters<typeof updateUserWord>[3]) =>
    owner
      ? updateUserWord(getLocalDb(), owner, userWordId, patch).then(() => undefined)
      : Promise.resolve();
  const saveAdditions = (userWordId: string, additions: UserAdditions) =>
    save(userWordId, { user_additions: serializeAdditions(additions) });

  const activeTab = view.tabs.includes(tab) ? tab : "meaning";
  const close = () => setSheet(null);
  const target = sheet ? resolveTarget(view, sheet) : null;
  const meaningSense =
    sheet?.kind === "meaning" ? view.senses.find((s) => s.senseId === sheet.senseId) : undefined;
  const imageRef = view.image?.kind === "custom" ? view.image.path : null;

  return (
    <CardProvider value={{ view, owner, open: setSheet, addSense, inSession, autoPlay }}>
      {topBar?.(true)}
      <div className={cn("flex flex-col gap-4", !inSession && "pb-10")}>
        <CardHeader />

        {quick ? (
          <MeaningTab />
        ) : (
          <Tabs.Root value={activeTab} onValueChange={(v) => setTab(v as WordCardTab)}>
            <Tabs.List
              aria-label={t("wordCard.tabsLabel")}
              className={cn(
                "grid border-b bg-background px-1",
                inSession
                  ? "-mx-1"
                  : "sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-[5] -mx-4",
              )}
              style={{ gridTemplateColumns: `repeat(${view.tabs.length}, minmax(0, 1fr))` }}
            >
              {view.tabs.map((id) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className="flex min-h-12 items-center justify-center border-b-2 border-transparent px-0.5 text-center text-[13px] leading-tight text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-accent-foreground"
                >
                  {t(`wordCard.tabs.${id}`)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <div className="pt-4">
              <Tabs.Content value="meaning">
                <MeaningTab />
              </Tabs.Content>
              <Tabs.Content value="examples">
                <ExamplesTab voice={accent === "uk" ? "uk" : "us"} />
              </Tabs.Content>
              <Tabs.Content value="usage">
                <UsageTab />
              </Tabs.Content>
              <Tabs.Content value="related">
                <RelatedTab />
              </Tabs.Content>
              <Tabs.Content value="memory">
                <MemoryTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        )}
      </div>

      {target && (
        <AdditionSheet
          key={`${target.userWordId}:${target.layer}:${target.itemId ?? "new"}`}
          view={view}
          target={target}
          onClose={close}
          onSave={saveAdditions}
        />
      )}
      {meaningSense?.userWordId && (
        <MeaningSheet
          sense={meaningSense}
          onClose={close}
          onSave={(meaning) => save(meaningSense.userWordId!, { custom_meaning: meaning })}
        />
      )}
      {sheet?.kind === "image" && view.primaryUserWordId && (
        <ImageSheet
          owner={owner}
          currentRef={imageRef}
          onClose={close}
          onSave={(ref) => save(view.primaryUserWordId!, { custom_image_url: ref })}
        />
      )}
      {sheet?.kind === "report" && (
        <ReportSheet
          view={view}
          owner={owner}
          layer={sheet.layer}
          senseId={sheet.senseId}
          onClose={close}
          onSent={() => showToast({ text: t("wordCard.reportSheet.sent") })}
        />
      )}
      {sheet?.kind === "chip" &&
        (inSession ? (
          <SessionChipSheet word={sheet.word} pos={sheet.pos} owner={owner} onClose={close} />
        ) : (
          <ChipSheet word={sheet.word} pos={sheet.pos} onClose={close} />
        ))}
    </CardProvider>
  );
}
