"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { randomId } from "@/lib/db/ids";
import { containsWordForm } from "@/lib/words/highlight";
import {
  ADDITION_LIMITS,
  MAX_ITEMS_PER_LAYER,
  addAddition,
  removeAddition,
  updateAddition,
  type AdditionLayer,
  type AdditionResult,
  type UserAdditions,
} from "@/lib/words/user-additions";
import type { WordCardView } from "@/lib/words/word-card";
import type { SheetState } from "./parts";

type Fields = { a: string; b: string };

const FIELD_KEYS: Record<
  AdditionLayer,
  { a: string; b: string | null; aMax: number; bMax: number }
> = {
  meaning: { a: "note", b: null, aMax: ADDITION_LIMITS.text, bMax: 0 },
  examples: {
    a: "sentence",
    b: "translation",
    aMax: ADDITION_LIMITS.sentence,
    bMax: ADDITION_LIMITS.translation,
  },
  usage: { a: "phrase", b: "phraseNote", aMax: ADDITION_LIMITS.phrase, bMax: ADDITION_LIMITS.note },
  related: { a: "word", b: "wordNote", aMax: ADDITION_LIMITS.word, bMax: ADDITION_LIMITS.note },
  memory: { a: "mnemonic", b: null, aMax: ADDITION_LIMITS.text, bMax: 0 },
};

function toInput(layer: AdditionLayer, { a, b }: Fields) {
  switch (layer) {
    case "meaning":
    case "memory":
      return { text: a };
    case "examples":
      return { sentence: a, translation_vi: b };
    case "usage":
      return { phrase: a, note: b };
    case "related":
      return { word: a, note: b };
  }
}

function fromItem(layer: AdditionLayer, item: Record<string, unknown>): Fields {
  const s = (key: string) => (typeof item[key] === "string" ? (item[key] as string) : "");
  switch (layer) {
    case "meaning":
    case "memory":
      return { a: s("text"), b: "" };
    case "examples":
      return { a: s("sentence"), b: s("translation_vi") };
    case "usage":
      return { a: s("phrase"), b: s("note") };
    case "related":
      return { a: s("word"), b: s("note") };
  }
}

type Target = {
  layer: AdditionLayer;
  userWordId: string;
  additions: UserAdditions;
  itemId: string | null;
};

/** Tìm user_words và mục đang sửa cho bảng thêm/sửa nội dung "Của bạn". */
export function resolveTarget(view: WordCardView, state: SheetState): Target | null {
  if (state.kind === "add") {
    const sense =
      state.layer === "memory" || !state.senseId
        ? view.senses.find((s) => s.userWordId === view.primaryUserWordId)
        : view.senses.find((s) => s.senseId === state.senseId);
    if (!sense?.userWordId) return null;
    return {
      layer: state.layer,
      userWordId: sense.userWordId,
      additions: sense.additions,
      itemId: null,
    };
  }
  if (state.kind === "edit") {
    const sense = view.senses.find((s) => s.userWordId === state.userWordId);
    if (!sense) return null;
    return {
      layer: state.layer,
      userWordId: state.userWordId,
      additions: sense.additions,
      itemId: state.itemId,
    };
  }
  return null;
}

export function AdditionSheet({
  view,
  target,
  onClose,
  onSave,
}: {
  view: WordCardView;
  target: Target;
  onClose: () => void;
  onSave: (userWordId: string, additions: UserAdditions) => Promise<void>;
}) {
  const t = useTranslations("wordCard");
  const { layer, itemId } = target;
  const keys = FIELD_KEYS[layer];
  const existing = itemId
    ? (target.additions[layer] as { id: string }[]).find((i) => i.id === itemId)
    : undefined;
  const [fields, setFields] = useState<Fields>(() =>
    existing ? fromItem(layer, existing as Record<string, unknown>) : { a: "", b: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const missingWord =
    layer === "examples" &&
    fields.a.trim().length > 0 &&
    !containsWordForm(fields.a, view.content.lemma, view.highlightTerms);

  async function apply(result: AdditionResult) {
    if (!result.ok) {
      setError(
        result.error === "too_many"
          ? t("sheet.tooMany", { max: MAX_ITEMS_PER_LAYER })
          : t("sheet.invalid"),
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(target.userWordId, result.additions);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = toInput(layer, fields);
    void apply(
      itemId
        ? updateAddition(target.additions, layer, itemId, input as never)
        : addAddition(target.additions, layer, input as never, randomId()),
    );
  }

  const multiline = layer !== "related" && layer !== "usage";
  const inputClass =
    "w-full rounded-lg border bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={itemId ? t("sheet.editTitle") : t(`sheet.${layer}Title`)}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t(`sheet.${keys.a}` as "sheet.note")}
          {multiline ? (
            <textarea
              value={fields.a}
              onChange={(e) => setFields({ ...fields, a: e.target.value })}
              maxLength={keys.aMax}
              rows={3}
              required
              autoFocus
              lang={layer === "examples" ? "en" : undefined}
              className={inputClass}
            />
          ) : (
            <input
              value={fields.a}
              onChange={(e) => setFields({ ...fields, a: e.target.value })}
              maxLength={keys.aMax}
              required
              autoFocus
              lang="en"
              autoCapitalize="none"
              className={inputClass}
            />
          )}
        </label>
        {missingWord && (
          <p className="text-sm text-amber-800 dark:text-amber-300" role="status">
            {t("sheet.missingWord", { word: view.content.lemma })}
          </p>
        )}
        {keys.b && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t(`sheet.${keys.b}` as "sheet.note")}
            <input
              value={fields.b}
              onChange={(e) => setFields({ ...fields, b: e.target.value })}
              maxLength={keys.bMax}
              className={inputClass}
            />
          </label>
        )}
        {layer === "examples" && (
          <p className="text-xs text-muted-foreground">{t("sheet.examplesHint")}</p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {itemId && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 text-destructive"
              disabled={saving}
              onClick={() => void apply(removeAddition(target.additions, layer, itemId))}
            >
              {t("delete")}
            </Button>
          )}
          <Button type="submit" className="min-h-11 flex-1" disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
