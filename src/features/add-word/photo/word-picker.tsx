"use client";

import { Fragment, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AlertTriangle, Minus, Plus, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import type { OcrDocument } from "@/lib/ocr/document";
import { MAX_SKEW_DEGREES } from "@/lib/ocr/image";
import {
  autoPick,
  candidateText,
  isPicked,
  pickRange,
  pickText,
  togglePick,
  type Pick,
  type WordInfo,
} from "@/lib/ocr/pick";
import { cn } from "@/lib/utils";

/** Tối đa số mục chọn một lần (một lượt tra kho). */
export const MAX_PICKS = 50;
const ZOOMS: readonly number[] = [1, 1.5, 2, 3];
/** Kéo xa hơn mức này (px) mới tính là kéo chọn cụm. */
const DRAG_PX = 8;

type View = "image" | "text";

export function WordPicker({
  doc,
  imageUrl,
  info,
  level,
  picks,
  onPicksChange,
  keepImage,
  onKeepImageChange,
  onNext,
  onRetake,
}: {
  doc: OcrDocument;
  imageUrl: string;
  /** null khi đang đối chiếu với kho. */
  info: ReadonlyMap<string, WordInfo> | null;
  level: string | null;
  picks: Pick[];
  onPicksChange: (picks: Pick[]) => void;
  keepImage: boolean;
  onKeepImageChange: (keep: boolean) => void;
  onNext: () => void;
  onRetake: () => void;
}) {
  const t = useTranslations("addWord.photo");
  const hasBoxes = doc.source === "vision" && doc.tokens.some((tk) => tk.boxes.length > 0);
  const [view, setView] = useState<View>(hasBoxes ? "image" : "text");
  const [zoom, setZoom] = useState(0);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [gesture, setGesture] = useState<{
    index: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const owned = (index: number) => {
    const text = candidateText(doc.tokens[index]!.text);
    return !!text && !!info?.get(text)?.owned;
  };

  function commit(next: Pick[]) {
    if (next.length > MAX_PICKS) {
      showToast({ text: t("tooMany", { max: MAX_PICKS }) });
      return;
    }
    onPicksChange(next);
  }

  function tokenAt(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-token]");
    return element ? Number(element.dataset.token) : null;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>, index: number) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setGesture({ index, x: event.clientX, y: event.clientY, moved: false });
  }

  function onPointerMove(event: PointerEvent) {
    const g = gesture;
    if (!g) return;
    if (!g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < DRAG_PX) return;
    if (!g.moved) setGesture({ ...g, moved: true });
    const over = tokenAt(event.clientX, event.clientY);
    if (over !== null) setRange({ from: Math.min(g.index, over), to: Math.max(g.index, over) });
  }

  function onPointerUp(event: PointerEvent) {
    const g = gesture;
    setGesture(null);
    setRange(null);
    if (!g) return;
    const end = g.moved ? tokenAt(event.clientX, event.clientY) : null;
    if (end !== null && end !== g.index) commit(pickRange(doc, picks, g.index, end));
    else if (!g.moved) commit(togglePick(doc, picks, g.index));
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    commit(togglePick(doc, picks, index));
  }

  function runAutoPick() {
    if (!info) return;
    const indices = autoPick(doc, info, level);
    if (indices.length === 0) {
      showToast({ text: t("autoNone") });
      return;
    }
    let next = picks;
    for (const index of indices) if (!isPicked(next, index)) next = togglePick(doc, next, index);
    commit(next.slice(0, MAX_PICKS));
  }

  const inRange = (index: number) => !!range && range.from <= index && index <= range.to;

  const wordProps = (index: number) => {
    const token = doc.tokens[index]!;
    const selected = isPicked(picks, index);
    return {
      "data-token": index,
      role: "button" as const,
      tabIndex: 0,
      "aria-pressed": selected,
      "aria-label": token.text,
      onPointerDown: (e: PointerEvent<HTMLElement>) => onPointerDown(e, index),
      onKeyDown: (e: KeyboardEvent) => onKeyDown(e, index),
      selected,
      known: owned(index),
    };
  };

  const warnings: string[] = [];
  if (doc.skewDegrees !== null && Math.abs(doc.skewDegrees) > MAX_SKEW_DEGREES) {
    warnings.push(t("warnSkew"));
  }
  if (doc.meanConfidence !== null && doc.meanConfidence < 0.8) warnings.push(t("warnConfidence"));
  if (!hasBoxes) warnings.push(t("warnTextOnly"));

  return (
    <section
      className="flex flex-col gap-3 pb-64"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setGesture(null);
        setRange(null);
      }}
    >
      <div className="flex items-center gap-2">
        {hasBoxes && (
          <div
            role="radiogroup"
            aria-label={t("viewLabel")}
            className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-muted p-1"
          >
            {(["image", "text"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "min-h-11 rounded-lg px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                  view === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground",
                )}
              >
                {t(v === "image" ? "viewImage" : "viewText")}
              </button>
            ))}
          </div>
        )}
        {view === "image" && (
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              aria-label={t("zoomOut")}
              disabled={zoom === 0}
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
            >
              <Minus aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              aria-label={t("zoomIn")}
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            >
              <Plus aria-hidden />
            </Button>
          </div>
        )}
        <Button variant="ghost" className="min-h-11 shrink-0" onClick={onRetake}>
          {t("retake")}
        </Button>
      </div>

      {warnings.map((w) => (
        <p
          key={w}
          className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {w}
        </p>
      ))}

      <p className="text-sm text-muted-foreground">{t("pickHint")}</p>

      {view === "image" ? (
        <div className="overflow-auto rounded-xl bg-slate-800" aria-label={t("imageLabel")}>
          <div className="relative" style={{ width: `${(ZOOMS[zoom] ?? 1) * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="block h-auto w-full select-none"
              draggable={false}
            />
            {doc.tokens.map((token, index) =>
              token.kind === "word"
                ? token.boxes.map((box, b) => {
                    const { selected, known, ...props } = wordProps(index);
                    return (
                      <span
                        key={`${index}:${b}`}
                        {...props}
                        {...(b > 0 ? { tabIndex: -1, "aria-hidden": true } : {})}
                        className={cn(
                          "absolute touch-pan-y rounded-[3px] border-2 focus-visible:outline-2 focus-visible:outline-ring",
                          selected || inRange(index)
                            ? "border-primary bg-primary/30"
                            : known
                              ? "border-slate-400/80 bg-slate-500/25"
                              : "border-transparent hover:border-primary/60",
                        )}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.w * 100}%`,
                          height: `${box.h * 100}%`,
                        }}
                      />
                    );
                  })
                : null,
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl border p-3 leading-relaxed"
          lang="en"
          aria-label={t("textLabel")}
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
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border-t bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold" role="status" aria-live="polite">
              {t("selected", { count: picks.length })}
            </p>
            <Button
              variant="outline"
              className="min-h-11 border-primary text-primary"
              disabled={!info}
              onClick={runAutoPick}
            >
              <Sparkles aria-hidden />
              {info ? t("autoPick") : t("matching")}
            </Button>
          </div>
          {picks.length > 0 && (
            <ul aria-label={t("selectedLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1">
              {picks.map((pick) => {
                const text = pickText(doc, pick);
                return (
                  <li key={`${pick.from}-${pick.to}`} className="shrink-0">
                    <button
                      type="button"
                      aria-label={t("remove", { word: text })}
                      onClick={() => commit(picks.filter((p) => p !== pick))}
                      className="flex min-h-11 items-center gap-1 rounded-full bg-accent px-3 text-sm text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      lang="en"
                    >
                      {text}
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={keepImage}
              onChange={(e) => onKeepImageChange(e.target.checked)}
              className="size-5 accent-primary"
            />
            {t("keepImage")}
          </label>
          <Button className="min-h-11" disabled={picks.length === 0} onClick={onNext}>
            {t("next", { count: picks.length })}
          </Button>
        </div>
      </div>
    </section>
  );
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
