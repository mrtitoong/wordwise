"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, RefreshCw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, Tabs } from "radix-ui";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { CardHeader } from "@/features/words/word-card/card-header";
import { ExamplesTab } from "@/features/words/word-card/examples-tab";
import { MeaningTab } from "@/features/words/word-card/meaning-tab";
import { MemoryTab } from "@/features/words/word-card/memory-tab";
import { CardProvider } from "@/features/words/word-card/parts";
import { RelatedTab } from "@/features/words/word-card/related-tab";
import { UsageTab } from "@/features/words/word-card/usage-tab";
import { requestRegenerate } from "@/lib/admin/request-regenerate";
import { REGENERATE_TABS, type RegenerateTab, type ReviewItem } from "@/lib/admin/review";
import type { Pos, WordContent } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import type { StoredWord } from "@/lib/words/api";
import { buildWordCard } from "@/lib/words/word-card";
import { getWord, saveWordContent, setItemSense } from "../review-actions";
import { reviewErrorKey } from "./errors";
import { WarningChips } from "./warning-chips";
import { WordEditor } from "./word-editor";

const NO_PERSONAL = { userWords: [], entries: [], notebooks: [] };
const noop = () => {};

/**
 * Khung chi tiết một từ ở màn duyệt: xem thẻ 5 tab, đổi nghĩa, sửa nội dung dùng chung, tạo lại
 * một tab bằng AI, chấp nhận, đổi vị trí, bỏ khỏi danh sách.
 */
export function ReviewPanel({
  listId,
  item,
  total,
  editable,
  onClose,
  onChange,
  onAccept,
  onMove,
  onRemove,
}: {
  listId: string;
  item: ReviewItem;
  total: number;
  editable: boolean;
  onClose: () => void;
  onChange: (item: ReviewItem) => void;
  onAccept: (accepted: boolean) => void;
  onMove: (position: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.review");
  const tc = useTranslations("wordCard");
  const [word, setWord] = useState<StoredWord | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [tab, setTab] = useState<RegenerateTab>("meaning");
  /** Nội dung đang sửa (có thể là bản AI vừa tạo, chưa lưu). */
  const [draft, setDraft] = useState<WordContent | null>(null);
  const [draftFromAi, setDraftFromAi] = useState(false);
  const [position, setPosition] = useState(String(item.order + 1));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void getWord(item.wordId).then((result) => {
      if (cancelled) return;
      if (result.ok) setWord(result.data.word);
      else setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [item.wordId]);

  const view = useMemo(() => (word ? buildWordCard(word, NO_PERSONAL) : null), [word]);
  const fail = (error: string) => showToast({ text: t(reviewErrorKey(error)) });

  const chooseSense = (senseId: string) => {
    if (!word || senseId === item.senseId) return;
    const index = word.senseIds.indexOf(senseId);
    const before = item;
    // Đổi ngay trên màn hình, server từ chối thì trả lại.
    onChange({
      ...item,
      senseId,
      meaningVi: word.content.senses[index]!.meaning_vi,
      warnings: item.warnings.filter(
        (w) => w.code !== "no_context" && !(w.code === "low_confidence" && w.source === "sense"),
      ),
    });
    startTransition(async () => {
      const result = await setItemSense(listId, item.id, senseId);
      if (!result.ok) {
        onChange(before);
        fail(result.error);
      }
    });
  };

  const regenerate = () =>
    startTransition(async () => {
      const result = await requestRegenerate(createClient(), item.wordId, tab);
      if (result.status !== "ok") return fail(`regenerate_${result.status}`);
      setDraft(result.content);
      setDraftFromAi(true);
      setMode("edit");
    });

  const save = (content: WordContent) =>
    startTransition(async () => {
      const result = await saveWordContent(listId, item.wordId, content);
      if (!result.ok) return fail(result.error);
      const saved = result.data.word;
      setWord(saved);
      setDraft(null);
      setDraftFromAi(false);
      setMode("view");
      const index = saved.senseIds.indexOf(item.senseId);
      if (index >= 0) onChange({ ...item, meaningVi: saved.content.senses[index]!.meaning_vi });
      showToast({ text: t("saved") });
    });

  const move = () => {
    const value = Number(position);
    if (Number.isInteger(value) && value >= 1 && value <= total) onMove(value);
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-background p-4 shadow-lg md:p-6"
        >
          <div className="flex items-start gap-2">
            <Dialog.Title className="flex-1 pt-2 text-xl font-semibold">
              {item.lemma}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {tc(`pos.${item.pos as Pos}`)}
              </span>
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>

          <WarningChips warnings={item.warnings} />
          {item.contextSentence && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              <span className="font-medium">{t("context")}: </span>
              {item.contextSentence}
            </p>
          )}

          {editable && (
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                className="min-h-11"
                variant={item.accepted ? "outline" : "default"}
                disabled={pending}
                onClick={() => onAccept(!item.accepted)}
              >
                <Check aria-hidden />
                {item.accepted ? t("unaccept") : t("accept")}
              </Button>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{t("position", { total })}</span>
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="min-h-11 w-24 rounded-md border bg-background px-2"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending || Number(position) === item.order + 1}
                onClick={move}
              >
                {t("move")}
              </Button>
              <Button
                type="button"
                variant={confirmRemove ? "destructive" : "ghost"}
                className="min-h-11"
                disabled={pending}
                onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
              >
                <Trash2 aria-hidden />
                {confirmRemove ? t("removeConfirm") : t("remove")}
              </Button>
            </div>
          )}

          {loadError && <p role="alert">{t("errors.not_found")}</p>}
          {!word || !view ? (
            !loadError && <p className="text-muted-foreground">{t("loading")}</p>
          ) : (
            <>
              {editable && word.senseIds.length > 1 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-sm font-medium">{t("chooseSense")}</legend>
                  {word.content.senses.map((sense, i) => {
                    const id = word.senseIds[i]!;
                    return (
                      <label
                        key={id}
                        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"
                      >
                        <input
                          type="radio"
                          name="sense"
                          className="size-4"
                          checked={id === item.senseId}
                          disabled={pending}
                          onChange={() => chooseSense(id)}
                        />
                        <span>
                          <span className="font-medium">{sense.meaning_vi}</span>
                          <span className="text-muted-foreground"> — {sense.definition_en}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              )}

              <div role="group" aria-label={t("mode")} className="flex gap-2 border-b pb-2">
                {(["view", "edit"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className="min-h-11 rounded-md px-3 text-sm aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-accent-foreground"
                  >
                    {t(`modes.${m}`)}
                  </button>
                ))}
              </div>

              {mode === "view" ? (
                <CardProvider
                  value={{ view, owner: null, open: noop, addSense: noop, readOnly: true }}
                >
                  <CardHeader />
                  <Tabs.Root value={tab} onValueChange={(v) => setTab(v as RegenerateTab)}>
                    <Tabs.List aria-label={tc("tabsLabel")} className="grid grid-cols-5 border-b">
                      {REGENERATE_TABS.map((id) => (
                        <Tabs.Trigger
                          key={id}
                          value={id}
                          className="flex min-h-11 items-center justify-center border-b-2 border-transparent px-0.5 text-center text-[13px] text-muted-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-accent-foreground"
                        >
                          {tc(`tabs.${id}`)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    <div className="flex flex-col gap-3 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 self-start"
                        disabled={pending}
                        onClick={regenerate}
                      >
                        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
                        {t("regenerate", { tab: tc(`tabs.${tab}`) })}
                      </Button>
                      <Tabs.Content value="meaning">
                        <MeaningTab />
                      </Tabs.Content>
                      <Tabs.Content value="examples">
                        <ExamplesTab voice="us" />
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
                </CardProvider>
              ) : (
                <>
                  {draftFromAi && (
                    <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
                      {t("aiDraft")}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{t("sharedWarning")}</p>
                  <WordEditor
                    key={draft ? "draft" : "saved"}
                    initial={draft ?? word.content}
                    initialTab={tab}
                    saving={pending}
                    onCancel={() => {
                      setDraft(null);
                      setDraftFromAi(false);
                      setMode("view");
                    }}
                    onSave={save}
                  />
                </>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
