"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, ImageUp, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { uploadImageBlob } from "@/features/media/user-images";
import type { OcrDocument } from "@/lib/ocr/document";
import { qualityIssues, type CropRect, type QualityIssue, type Rotation } from "@/lib/ocr/image";
import { pickContext, pickText, type Pick, type WordInfo } from "@/lib/ocr/pick";
import { requestOcr } from "@/lib/ocr/request-ocr";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { EntryContext } from "../add-word-screen";
import { lookupWords } from "../lookup-words";
import { usePlan } from "../use-plan";
import {
  encodeContextImage,
  encodeForOcr,
  loadPhoto,
  renderPhoto,
  sampleQuality,
  type Photo,
} from "./image-tools";
import { PhotoEditor } from "./photo-editor";
import { PhotoReview, type ReviewItem } from "./photo-review";
import { WordPicker } from "./word-picker";

type Failure = "offline" | "unavailable" | "no_text" | "limit" | "premium" | "login" | "encode";

type Step =
  | { kind: "start"; error?: "unsupported" }
  | { kind: "edit" }
  | { kind: "quality"; issues: QualityIssue[] }
  | { kind: "reading" }
  | { kind: "failed"; reason: Failure; dailyLimit?: number }
  | { kind: "pick" }
  | { kind: "review"; items: ReviewItem[] };

/**
 * Tab Ảnh (chỉ Premium): chụp/chọn ảnh → xoay, cắt → kiểm tra chất lượng → đọc chữ (máy chủ) →
 * chọn từ trên ảnh → kiểm tra chính tả → thêm (cách nhập "photo", câu gốc làm câu đã gặp).
 */
export function PhotoEntry({ context }: { context: EntryContext }) {
  const t = useTranslations("addWord.photo");
  const plan = usePlan(context.owner, context.signedIn);
  const [step, setStep] = useState<Step>({ kind: "start" });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [ocrImage, setOcrImage] = useState<{ base64: string; url: string } | null>(null);
  const [doc, setDoc] = useState<OcrDocument | null>(null);
  const [info, setInfo] = useState<Map<string, WordInfo> | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [keepImage, setKeepImage] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  // Giải phóng ảnh xem trước khi đổi ảnh hoặc rời tab.
  useEffect(
    () => () => {
      if (ocrImage) URL.revokeObjectURL(ocrImage.url);
    },
    [ocrImage],
  );
  useEffect(() => () => photo?.bitmap.close(), [photo]);

  function reset() {
    setPhoto(null);
    setCanvas(null);
    setOcrImage(null);
    setDoc(null);
    setInfo(null);
    setPicks([]);
    setKeepImage(false);
    setStep({ kind: "start" });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const loaded = await loadPhoto(file);
    if (!loaded) {
      setStep({ kind: "start", error: "unsupported" });
      return;
    }
    reset();
    setPhoto(loaded);
    setStep({ kind: "edit" });
  }

  async function prepare(rotation: Rotation, crop: CropRect) {
    if (!photo) return;
    const rendered = renderPhoto(photo, rotation, crop);
    setCanvas(rendered);
    const encoded = await encodeForOcr(rendered);
    if (!encoded) {
      setStep({ kind: "failed", reason: "encode" });
      return;
    }
    setOcrImage({ base64: encoded.base64, url: URL.createObjectURL(encoded.blob) });
    const issues = qualityIssues(sampleQuality(rendered), {
      width: rendered.width,
      height: rendered.height,
    });
    if (issues.length) setStep({ kind: "quality", issues });
    else await read(encoded.base64);
  }

  async function read(base64 = ocrImage?.base64) {
    if (!base64) return;
    if (!context.online || !getSupabaseEnv()) {
      setStep({ kind: "failed", reason: "offline" });
      return;
    }
    setStep({ kind: "reading" });
    const response = await requestOcr(createClient(), base64);
    if (response.status !== "ok") {
      const reason: Record<Exclude<typeof response.status, "ok">, Failure> = {
        no_text: "no_text",
        login_required: "login",
        premium_required: "premium",
        limit_reached: "limit",
        unavailable: navigator.onLine ? "unavailable" : "offline",
      };
      setStep({
        kind: "failed",
        reason: reason[response.status],
        ...(response.status === "limit_reached" ? { dailyLimit: response.dailyLimit } : {}),
      });
      return;
    }
    setDoc(response.document);
    setPicks([]);
    setInfo(null);
    setStep({ kind: "pick" });
    lookupWords(response.document, context.ownedSenseIds)
      .then(setInfo)
      // Không tra được kho: vẫn chọn tay được, chỉ thiếu khung xám và Tự chọn.
      .catch(() => setInfo(new Map()));
  }

  if (!context.signedIn) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm">{t("needAccount")}</p>
        <Button asChild className="min-h-11">
          <Link href="/login?next=%2Fadd">{t("signIn")}</Link>
        </Button>
      </section>
    );
  }
  if (plan === "free" || (step.kind === "failed" && step.reason === "premium")) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          {t("premiumTitle")}
        </h2>
        <p className="text-sm">{t("premiumBody")}</p>
      </section>
    );
  }
  if (plan === null) return null;

  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={t("takePhoto")}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        aria-label={t("choosePhoto")}
        data-testid="photo-file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  if (step.kind === "review" && doc) {
    return (
      <PhotoReview
        items={step.items}
        context={context}
        uploadImage={
          keepImage && canvas
            ? async () => {
                const image = await encodeContextImage(canvas);
                if (!image) return null;
                const result = await uploadImageBlob(context.owner, image);
                return result.ok ? result.ref : null;
              }
            : null
        }
        onBack={() => setStep({ kind: "pick" })}
        onDone={reset}
      />
    );
  }

  if (step.kind === "pick" && doc && ocrImage) {
    return (
      <WordPicker
        doc={doc}
        imageUrl={ocrImage.url}
        info={info}
        level={context.cefrLevel}
        picks={picks}
        onPicksChange={setPicks}
        keepImage={keepImage}
        onKeepImageChange={setKeepImage}
        onRetake={reset}
        onNext={() =>
          setStep({
            kind: "review",
            items: picks.map((p) => ({ text: pickText(doc, p), context: pickContext(doc, p) })),
          })
        }
      />
    );
  }

  if (step.kind === "edit" && photo) {
    return <PhotoEditor photo={photo} onRetake={reset} onDone={(r, c) => void prepare(r, c)} />;
  }

  if (step.kind === "quality" || step.kind === "reading" || step.kind === "failed") {
    const message =
      step.kind === "quality"
        ? [...step.issues.map((issue) => t(`quality.${issue}`)), t("quality.hint")].join(" ")
        : step.kind === "failed"
          ? t(`errors.${step.reason}`, { limit: step.dailyLimit ?? 30 })
          : null;
    return (
      <section className="flex flex-col gap-3">
        {ocrImage && (
          <div className="relative overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ocrImage.url}
              alt={t("photoAlt")}
              className={step.kind === "reading" ? "w-full opacity-40" : "w-full"}
            />
            {step.kind === "reading" && (
              <p
                className="absolute inset-0 flex items-center justify-center gap-2 font-medium"
                role="status"
              >
                <Loader2 className="size-5 animate-spin" aria-hidden />
                {t("reading")}
              </p>
            )}
          </div>
        )}
        {message && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {message}
          </p>
        )}
        {step.kind !== "reading" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-11" onClick={reset}>
              {t("retake")}
            </Button>
            {step.kind === "quality" ? (
              <Button className="min-h-11" onClick={() => void read()}>
                {t("useAnyway")}
              </Button>
            ) : (
              ["offline", "unavailable"].includes(step.reason) && (
                <Button
                  className="min-h-11"
                  disabled={step.reason === "offline" && !context.online}
                  onClick={() => void read()}
                >
                  {t("retry")}
                </Button>
              )
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {inputs}
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-24 flex-col gap-2" onClick={() => camera.current?.click()}>
          <Camera className="size-7" aria-hidden />
          {t("takePhoto")}
        </Button>
        <Button
          variant="outline"
          className="min-h-24 flex-col gap-2"
          onClick={() => gallery.current?.click()}
        >
          <ImageUp className="size-7" aria-hidden />
          {t("choosePhoto")}
        </Button>
      </div>
      {step.kind === "start" && step.error && (
        <p className="text-sm text-destructive" role="alert">
          {t("errors.unsupported")}
        </p>
      )}
      {!context.online && <p className="text-sm text-muted-foreground">{t("needOnline")}</p>}
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}
