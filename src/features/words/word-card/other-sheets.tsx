"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { GUEST_OWNER, randomId } from "@/lib/db/ids";
import {
  USER_IMAGES_BUCKET,
  USER_IMAGE_MAX_BYTES,
  fitWithin,
  toUserImageRef,
  userImagePath,
  userImagePathFromRef,
} from "@/lib/media/user-images";
import type { Pos } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";
import {
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  sendContentReport,
  type ReportReason,
} from "@/lib/words/report";
import { lookupHref } from "@/lib/words/links";
import { CustomMeaningSchema, type AdditionLayer } from "@/lib/words/user-additions";
import type { SenseView, WordCardView } from "@/lib/words/word-card";

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring";

/* ---------- Đổi nghĩa hiển thị ---------- */

export function MeaningSheet({
  sense,
  onClose,
  onSave,
}: {
  sense: SenseView;
  onClose: () => void;
  onSave: (meaning: string | null) => Promise<void>;
}) {
  const t = useTranslations("wordCard");
  const [value, setValue] = useState(sense.customMeaning ?? sense.meaning_vi);
  const [saving, setSaving] = useState(false);

  async function save(meaning: string | null) {
    setSaving(true);
    try {
      await onSave(meaning);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = CustomMeaningSchema.safeParse(value);
    if (!parsed.success) return;
    // Trùng bản gốc thì coi như dùng bản gốc.
    void save(parsed.data === sense.meaning_vi ? null : parsed.data);
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("sheet.customMeaningTitle")}
      description={t("sheet.customMeaningHint")}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("sheet.customMeaning")}
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            rows={2}
            required
            autoFocus
            className={inputClass}
          />
        </label>
        <p className="text-sm text-muted-foreground">
          {t("original", { meaning: sense.meaning_vi })}
        </p>
        <div className="flex gap-2">
          {sense.customMeaning && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              disabled={saving}
              onClick={() => void save(null)}
            >
              {t("useOriginal")}
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

/* ---------- Ảnh gợi nhớ tự tải lên ---------- */

async function shrinkImage(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  for (const quality of [0.82, 0.6, 0.4]) {
    // Trình duyệt không hỗ trợ WebP sẽ trả PNG → dùng JPEG.
    const webp = await encode("image/webp", quality);
    const blob = webp?.type === "image/webp" ? webp : await encode("image/jpeg", quality);
    if (blob && blob.size <= USER_IMAGE_MAX_BYTES) {
      return { blob, ext: blob.type === "image/webp" ? "webp" : "jpg" };
    }
  }
  throw new Error("Ảnh quá lớn sau khi nén");
}

export function ImageSheet({
  owner,
  currentRef,
  onClose,
  onSave,
}: {
  owner: string | null;
  currentRef: string | null;
  onClose: () => void;
  onSave: (ref: string | null) => Promise<void>;
}) {
  const t = useTranslations("wordCard");
  const online = useOnlineStatus();
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "uploading" | "failed" | "unsupported">("idle");
  const signedIn = !!owner && owner !== GUEST_OWNER;

  async function removeOld() {
    const old = owner ? userImagePathFromRef(currentRef, owner) : null;
    if (old)
      await createClient()
        .storage.from(USER_IMAGES_BUCKET)
        .remove([old])
        .catch(() => {});
  }

  async function upload(file: File) {
    if (!owner) return;
    setState("uploading");
    let image: { blob: Blob; ext: "webp" | "jpg" };
    try {
      image = await shrinkImage(file);
    } catch {
      setState("unsupported");
      return;
    }
    const path = userImagePath(owner, randomId(), image.ext);
    const { error } = await createClient()
      .storage.from(USER_IMAGES_BUCKET)
      .upload(path, image.blob, { contentType: image.blob.type, upsert: false })
      .catch(() => ({ error: new Error("network") }));
    if (error) {
      setState("failed");
      return;
    }
    await removeOld();
    await onSave(toUserImageRef(path));
    onClose();
  }

  async function restoreOriginal() {
    await removeOld();
    await onSave(null);
    onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("image.title")}
      description={t("image.hint")}
    >
      {!signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("image.needAccount")}</p>
          <Button asChild className="min-h-11">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
              {t("reportSheet.signIn")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!online && <p className="text-sm text-muted-foreground">{t("image.needOnline")}</p>}
          <label
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-within:outline-2 focus-within:outline-ring",
              (!online || state === "uploading") && "pointer-events-none opacity-50",
            )}
          >
            {state === "uploading" ? t("image.uploading") : t("image.pick")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!online || state === "uploading"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          {state === "failed" && (
            <p className="text-sm text-destructive" role="alert">
              {t("image.failed")}
            </p>
          )}
          {state === "unsupported" && (
            <p className="text-sm text-destructive" role="alert">
              {t("image.unsupported")}
            </p>
          )}
          {currentRef && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={state === "uploading"}
              onClick={() => void restoreOriginal()}
            >
              {t("image.useOriginal")}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Báo lỗi ---------- */

export function ReportSheet({
  view,
  owner,
  layer,
  senseId,
  onClose,
  onSent,
}: {
  view: WordCardView;
  owner: string | null;
  layer: AdditionLayer;
  senseId: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useTranslations("wordCard");
  const online = useOnlineStatus();
  const pathname = usePathname();
  const [reason, setReason] = useState<ReportReason>("incorrect");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "limit" | "failed">("idle");
  const signedIn = !!owner && owner !== GUEST_OWNER;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const result = await sendContentReport(createClient(), {
      wordId: view.wordId,
      senseId,
      layer,
      reason,
      note,
    });
    if (result.ok) {
      onSent();
      onClose();
    } else {
      setState(result.error === "limit" ? "limit" : "failed");
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("reportSheet.title")}
      description={t("reportSheet.body")}
    >
      {!signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("reportSheet.needAccount")}</p>
          <Button asChild className="min-h-11">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
              {t("reportSheet.signIn")}
            </Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{t("reportSheet.reason")}</legend>
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{t(`reportSheet.reasons.${r}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("reportSheet.note")}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              rows={3}
              className={inputClass}
            />
          </label>
          {!online && (
            <p className="text-sm text-muted-foreground">{t("reportSheet.needOnline")}</p>
          )}
          {state === "limit" && (
            <p className="text-sm text-destructive" role="alert">
              {t("reportSheet.limit")}
            </p>
          )}
          {state === "failed" && (
            <p className="text-sm text-destructive" role="alert">
              {t("reportSheet.failed")}
            </p>
          )}
          <Button type="submit" className="min-h-11" disabled={!online || state === "sending"}>
            {state === "sending" ? t("reportSheet.sending") : t("reportSheet.send")}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

/* ---------- Chip từ liên quan ---------- */

export function ChipSheet({
  word,
  pos,
  onClose,
}: {
  word: string;
  pos: Pos | null;
  onClose: () => void;
}) {
  const t = useTranslations("wordCard");
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={t("chip.title", { word })}>
      <div className="flex flex-col gap-2">
        <Button asChild className="min-h-11">
          <Link href={lookupHref(word, pos)}>{t("chip.open")}</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={lookupHref(word, pos, true)}>{t("chip.add")}</Link>
        </Button>
      </div>
    </Sheet>
  );
}
