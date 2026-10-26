"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";
import { removeUserImage, uploadUserImage } from "@/features/media/user-images";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { addSensesToDefaultNotebook } from "@/lib/db/repo";
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
import { findLocal, lookupWord, type LookupResult } from "../word-data";

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

  async function upload(file: File) {
    if (!owner) return;
    setState("uploading");
    const result = await uploadUserImage(owner, file);
    if (!result.ok) {
      setState(result.error);
      return;
    }
    await removeUserImage(owner, currentRef);
    await onSave(result.ref);
    onClose();
  }

  async function restoreOriginal() {
    if (owner) await removeUserImage(owner, currentRef);
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

/**
 * Chip từ liên quan khi đang học từ mới trong phiên ôn: không rời phiên, chỉ xem nghĩa ngắn (nếu từ
 * đã có trong máy) và thêm vào "Sổ của tôi" (vào Sắp học). Từ chưa có trong kho thì báo đang chuẩn bị.
 */
export function SessionChipSheet({
  word,
  pos,
  owner,
  onClose,
}: {
  word: string;
  pos: Pos | null;
  owner: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("wordCard");
  const tRoot = useTranslations();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<LookupResult["status"] | null>(null);
  const meaning = useLiveQuery(async () => {
    const found = await findLocal(getLocalDb(), word, pos);
    if (!found) return null;
    return (await getLocalDb().word_senses.get(found.senseIds[0]!))?.meaning_vi ?? null;
  }, [word, pos]);

  async function add() {
    if (!owner) return;
    setBusy(true);
    setProblem(null);
    try {
      const db = getLocalDb();
      const found = await lookupWord(db, word, pos);
      if (found.status !== "found") {
        setProblem(found.status);
        return;
      }
      const notebook = tRoot("onboarding.defaultNotebook");
      await addSensesToDefaultNotebook(
        db,
        owner,
        found.senseIds.slice(0, 1),
        notebook,
        "typed",
        "word_card",
      );
      showToast({ text: t("chip.addedQueued", { word, notebook }) });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()} title={t("chip.title", { word })}>
      <div className="flex flex-col gap-3">
        {meaning && <p className="text-base">{meaning}</p>}
        {problem && (
          <p className="text-sm text-muted-foreground" role="alert">
            {problem === "preparing"
              ? t("chip.preparing")
              : problem === "login_required"
                ? t("state.loginRequired", { word })
                : problem === "limit_reached"
                  ? t("state.limitReached")
                  : t("state.unavailable")}
          </p>
        )}
        <Button className="min-h-11" disabled={!owner || busy} onClick={() => void add()}>
          {t("chip.addQueued")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("chip.sessionHint")}</p>
      </div>
    </Sheet>
  );
}
