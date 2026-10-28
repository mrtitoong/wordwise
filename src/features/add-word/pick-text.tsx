"use client";

import { Fragment, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { OcrDocument } from "@/lib/ocr/document";
import {
  candidateText,
  isPicked,
  pickRange,
  togglePick,
  type Pick,
  type WordInfo,
} from "@/lib/ocr/pick";
import { cn } from "@/lib/utils";

/** Kéo xa hơn mức này (px) mới tính là kéo chọn cụm. */
const DRAG_PX = 8;

/**
 * Chạm để chọn/bỏ chọn một từ, kéo để chọn cụm (tab Ảnh, tab Link). `wordProps(index)` gắn vào mỗi
 * từ (khung trên ảnh hoặc chữ), `containerProps` gắn vào vùng bao quanh để theo dõi ngón tay.
 */
export function usePickGestures(
  doc: OcrDocument,
  picks: readonly Pick[],
  info: ReadonlyMap<string, WordInfo> | null,
  commit: (next: Pick[]) => void,
) {
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [gesture, setGesture] = useState<{
    index: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  function tokenAt(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-token]");
    return element ? Number(element.dataset.token) : null;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>, index: number) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setGesture({ index, x: event.clientX, y: event.clientY, moved: false });
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    commit(togglePick(doc, picks, index));
  }

  const containerProps = {
    onPointerMove(event: PointerEvent) {
      const g = gesture;
      if (!g) return;
      if (!g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < DRAG_PX) return;
      if (!g.moved) setGesture({ ...g, moved: true });
      const over = tokenAt(event.clientX, event.clientY);
      if (over !== null) setRange({ from: Math.min(g.index, over), to: Math.max(g.index, over) });
    },
    onPointerUp(event: PointerEvent) {
      const g = gesture;
      setGesture(null);
      setRange(null);
      if (!g) return;
      const end = g.moved ? tokenAt(event.clientX, event.clientY) : null;
      if (end !== null && end !== g.index) commit(pickRange(doc, picks, g.index, end));
      else if (!g.moved) commit(togglePick(doc, picks, g.index));
    },
    onPointerCancel() {
      setGesture(null);
      setRange(null);
    },
  };

  const inRange = (index: number) => !!range && range.from <= index && index <= range.to;

  const wordProps = (index: number) => {
    const token = doc.tokens[index]!;
    const text = candidateText(token.text);
    return {
      "data-token": index,
      role: "button" as const,
      tabIndex: 0,
      "aria-pressed": isPicked(picks, index),
      "aria-label": token.text,
      onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(e, index),
      onKeyDown: (e: KeyboardEvent) => onKeyDown(e, index),
      selected: isPicked(picks, index),
      known: !!text && !!info?.get(text)?.owned,
    };
  };

  return { containerProps, wordProps, inRange };
}

/** Chỉ số token theo từng đoạn. */
function paragraphs(doc: OcrDocument): number[][] {
  const out: number[][] = [];
  doc.tokens.forEach((token, index) => {
    const last = out[out.length - 1];
    if (last && doc.tokens[last[0]!]!.paragraph === token.paragraph) last.push(index);
    else out.push([index]);
  });
  return out;
}

/** Văn bản chạm được: mỗi từ là một nút (vùng chạm ≥ 44px), dấu câu là chữ thường. */
export function PickableText({
  doc,
  label,
  wordProps,
  inRange,
}: {
  doc: OcrDocument;
  label: string;
  wordProps: ReturnType<typeof usePickGestures>["wordProps"];
  inRange: (index: number) => boolean;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-3 leading-relaxed"
      lang="en"
      aria-label={label}
    >
      {paragraphs(doc).map((indices) => (
        <p key={indices[0]}>
          {indices.map((index) => {
            const token = doc.tokens[index]!;
            const space = token.spaceBefore && index !== indices[0] ? " " : "";
            if (token.kind !== "word") {
              return (
                <Fragment key={index}>
                  {space}
                  <span>{token.text}</span>
                </Fragment>
              );
            }
            const { selected, known, ...props } = wordProps(index);
            return (
              <Fragment key={index}>
                {space}
                <span
                  {...props}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer touch-pan-y items-center rounded-md px-0.5 focus-visible:outline-2 focus-visible:outline-ring",
                    selected || inRange(index)
                      ? "bg-primary/20 font-semibold text-primary underline decoration-2"
                      : known
                        ? "text-muted-foreground"
                        : "hover:bg-muted",
                  )}
                >
                  {token.text}
                </span>
              </Fragment>
            );
          })}
        </p>
      ))}
    </div>
  );
}
