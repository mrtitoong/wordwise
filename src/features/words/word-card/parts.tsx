"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Flag, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Pos } from "@/lib/schema/word";
import { cn } from "@/lib/utils";
import { splitHighlight } from "@/lib/words/highlight";
import type { AdditionLayer } from "@/lib/words/user-additions";
import type { WordCardView } from "@/lib/words/word-card";

/** Bảng đang mở trên thẻ từ. */
export type SheetState =
  | { kind: "add"; layer: AdditionLayer; senseId: string | null }
  | { kind: "edit"; layer: AdditionLayer; userWordId: string; itemId: string }
  | { kind: "meaning"; senseId: string }
  | { kind: "image" }
  | { kind: "report"; layer: AdditionLayer; senseId: string | null }
  | { kind: "chip"; word: string; pos: Pos | null };

export type CardContextValue = {
  view: WordCardView;
  owner: string | null;
  open: (sheet: SheetState) => void;
  addSense: (senseId: string) => void;
};

const CardContext = createContext<CardContextValue | null>(null);

export const CardProvider = CardContext.Provider;

export function useCard(): CardContextValue {
  const value = useContext(CardContext);
  if (!value) throw new Error("useCard() cần nằm trong CardProvider");
  return value;
}

export function MineBadge() {
  const t = useTranslations("wordCard");
  return (
    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
      {t("mine")}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** Câu có từ khóa được tô đậm theo ranh giới từ. */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {splitHighlight(text, terms).map((segment, i) =>
        segment.hit ? (
          <strong key={i} className="font-semibold text-accent-foreground">
            {segment.text}
          </strong>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

const linkButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/** Hàng cuối mỗi lớp nội dung: "+ Thêm của bạn" và "Báo lỗi". */
export function LayerFooter({
  layer,
  senseId,
  canAdd = true,
}: {
  layer: AdditionLayer;
  senseId: string | null;
  canAdd?: boolean;
}) {
  const t = useTranslations("wordCard");
  const { view, open } = useCard();
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-1">
      {view.inNotebook && canAdd ? (
        <button
          type="button"
          onClick={() => open({ kind: "add", layer, senseId })}
          className={cn(linkButton, "font-medium text-primary")}
        >
          <Plus className="size-4" aria-hidden />
          {t(`add.${layer}`)}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={() => open({ kind: "report", layer, senseId })}
        className={cn(linkButton, "text-muted-foreground")}
      >
        <Flag className="size-4" aria-hidden />
        {t("report")}
      </button>
    </div>
  );
}

/** Một mục "Của bạn" (nhãn vàng + nút sửa). */
export function MineItem({
  layer,
  userWordId,
  itemId,
  children,
}: {
  layer: AdditionLayer;
  userWordId: string;
  itemId: string;
  children: ReactNode;
}) {
  const t = useTranslations("wordCard");
  const { open } = useCard();
  return (
    <li
      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"
      data-mine
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <MineBadge />
        {children}
      </div>
      <button
        type="button"
        onClick={() => open({ kind: "edit", layer, userWordId, itemId })}
        aria-label={t("edit")}
        className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** Chip từ liên quan: chạm để mở thẻ hoặc thêm vào sổ. */
export function WordChip({
  word,
  pos = null,
  children,
}: {
  word: string;
  pos?: Pos | null;
  children?: ReactNode;
}) {
  const { open } = useCard();
  return (
    <button
      type="button"
      onClick={() => open({ kind: "chip", word, pos })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-3.5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      {word}
      {children}
    </button>
  );
}
