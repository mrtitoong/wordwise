"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/features/media/user-images";
import {
  LIST_CEFR,
  LIST_LANGUAGES,
  LIST_PURPOSES,
  type ListForm as ListValues,
} from "@/lib/admin/lists";
import { randomId } from "@/lib/db/ids";
import { createClient } from "@/lib/supabase/client";
import { createList, updateList } from "./actions";

const field = "flex flex-col gap-1 text-sm";
const input = "min-h-11 rounded-lg border bg-background px-3 text-base";

/** Tải ảnh bìa vào bucket công khai list-covers (chỉ admin ghi được – RLS). */
async function uploadCover(file: File): Promise<string | null> {
  try {
    const image = await shrinkImage(file);
    const path = `${randomId()}.${image.ext}`;
    const storage = createClient().storage.from("list-covers");
    const { error } = await storage.upload(path, image.blob, { contentType: image.blob.type });
    return error ? null : storage.getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/** Form khai báo danh sách (tạo mới hoặc sửa). */
export function ListForm({ id, initial }: { id?: string; initial?: Partial<ListValues> }) {
  const t = useTranslations("admin.form");
  const router = useRouter();
  const [values, setValues] = useState<Partial<ListValues>>(initial ?? { language: "en" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "invalid" | "failed" | "coverFailed" | null>(
    null,
  );
  const set = (patch: Partial<ListValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setMessage(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    // Ô trống gửi undefined để schema đổi thành null.
    const payload = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, v === null || v === "" ? undefined : v]),
    );
    if (id) {
      const result = await updateList(id, payload);
      setMessage(result.ok ? "saved" : result.error === "invalid" ? "invalid" : "failed");
      if (result.ok) router.refresh();
    } else {
      const result = await createList(payload);
      if (result.ok) router.push(`/admin/lists/${result.data.id}`);
      else setMessage(result.error === "invalid" ? "invalid" : "failed");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <label className={`${field} md:col-span-2`}>
        {t("title")}
        <input
          required
          maxLength={200}
          value={values.title ?? ""}
          placeholder={t("titlePlaceholder")}
          onChange={(e) => set({ title: e.target.value })}
          className={input}
        />
      </label>
      <label className={field}>
        {t("language")}
        <select
          value={values.language ?? "en"}
          onChange={(e) => set({ language: e.target.value as ListValues["language"] })}
          className={input}
        >
          {LIST_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {t(`languages.${l}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        {t("cefr")}
        <select
          value={values.target_cefr ?? ""}
          onChange={(e) =>
            set({ target_cefr: (e.target.value || null) as ListValues["target_cefr"] })
          }
          className={input}
        >
          <option value="">{t("none")}</option>
          {LIST_CEFR.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        {t("topic")}
        <input
          maxLength={100}
          value={values.topic ?? ""}
          placeholder={t("topicPlaceholder")}
          onChange={(e) => set({ topic: e.target.value })}
          className={input}
        />
      </label>
      <label className={field}>
        {t("purpose")}
        <select
          value={values.purpose ?? ""}
          onChange={(e) => set({ purpose: (e.target.value || null) as ListValues["purpose"] })}
          className={input}
        >
          <option value="">{t("none")}</option>
          {LIST_PURPOSES.map((p) => (
            <option key={p} value={p}>
              {t(`purposes.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={`${field} md:col-span-2`}>
        {t("description")}
        <textarea
          rows={3}
          maxLength={1000}
          value={values.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          className="rounded-lg border bg-background p-3 text-base"
        />
      </label>
      <label className={field}>
        {t("days")}
        <input
          type="number"
          min={1}
          max={730}
          value={values.suggested_days ?? ""}
          onChange={(e) => set({ suggested_days: e.target.value ? Number(e.target.value) : null })}
          className={input}
        />
        <span className="text-xs text-muted-foreground">{t("daysHint")}</span>
      </label>
      <div className={field}>
        {t("cover")}
        <div className="flex flex-wrap items-center gap-3">
          {values.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh trong Supabase Storage
            <img src={values.cover_url} alt="" className="h-16 w-24 rounded-lg object-cover" />
          )}
          <label className="flex min-h-11 cursor-pointer items-center rounded-lg border px-4 hover:bg-muted">
            {t("coverChoose")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(true);
                const url = await uploadCover(file);
                setBusy(false);
                if (url) set({ cover_url: url });
                else setMessage("coverFailed");
              }}
            />
          </label>
          {values.cover_url && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => set({ cover_url: null })}
            >
              {t("coverRemove")}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? t("saving") : id ? t("save") : t("create")}
        </Button>
        {message && (
          <p role="status" className={message === "saved" ? "text-sm" : "text-sm text-destructive"}>
            {t(message)}
          </p>
        )}
      </div>
    </form>
  );
}
