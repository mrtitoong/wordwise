"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { RotateCcw, RotateCw, Scan } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  FULL_CROP,
  clampCrop,
  dragCorner,
  rotateBy,
  type CropRect,
  type Rotation,
} from "@/lib/ocr/image";
import { renderPhoto, type Photo } from "./image-tools";

const PREVIEW_SIDE = 1200;
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Corner = (typeof CORNERS)[number];

type Drag =
  | { kind: "corner"; corner: Corner }
  | { kind: "move"; start: { x: number; y: number }; crop: CropRect };

/** Xoay 90° và cắt khung trước khi đọc chữ. */
export function PhotoEditor({
  photo,
  onDone,
  onRetake,
}: {
  photo: Photo;
  onDone: (rotation: Rotation, crop: CropRect) => void;
  onRetake: () => void;
}) {
  const t = useTranslations("addWord.photo");
  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const holder = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const canvas = renderPhoto(photo, rotation, FULL_CROP, PREVIEW_SIDE);
    canvas.className = "block h-auto w-full select-none";
    canvas.setAttribute("aria-hidden", "true");
    holder.current?.replaceChildren(canvas);
  }, [photo, rotation]);

  function point(event: PointerEvent) {
    const rect = area.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function start(event: PointerEvent<HTMLElement>, next: Drag) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = next;
  }

  function move(event: PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const p = point(event);
    if (current.kind === "corner") setCrop((c) => dragCorner(c, current.corner, p));
    else
      setCrop(
        clampCrop({
          ...current.crop,
          x: current.crop.x + p.x - current.start.x,
          y: current.crop.y + p.y - current.start.y,
        }),
      );
  }

  function rotate(delta: 90 | -90) {
    setRotation((r) => rotateBy(r, delta));
    setCrop(FULL_CROP);
  }

  const cropped = crop.w < 0.999 || crop.h < 0.999;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("editHint")}</p>
      <div className="relative overflow-hidden rounded-xl bg-muted">
        <div ref={holder} />
        <div
          ref={area}
          className="absolute inset-0 touch-none"
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <div
            role="presentation"
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }}
            onPointerDown={(e) => start(e, { kind: "move", start: point(e), crop })}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                aria-hidden
                onPointerDown={(e) => start(e, { kind: "corner", corner })}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                className="absolute flex size-11 items-center justify-center"
                style={{
                  left: corner.endsWith("w") ? -22 : undefined,
                  right: corner.endsWith("e") ? -22 : undefined,
                  top: corner.startsWith("n") ? -22 : undefined,
                  bottom: corner.startsWith("s") ? -22 : undefined,
                }}
              >
                <span className="size-5 rounded-full border-2 border-primary bg-white shadow" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => rotate(-90)}>
          <RotateCcw aria-hidden />
          {t("rotateLeft")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => rotate(90)}>
          <RotateCw aria-hidden />
          {t("rotateRight")}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={!cropped}
          onClick={() => setCrop(FULL_CROP)}
        >
          <Scan aria-hidden />
          {t("resetCrop")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" onClick={onRetake}>
          {t("retake")}
        </Button>
        <Button className="min-h-11" onClick={() => onDone(rotation, crop)}>
          {t("read")}
        </Button>
      </div>
    </section>
  );
}
