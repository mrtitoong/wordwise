"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { removeUserImage, uploadUserImage } from "@/features/media/user-images";
import { GUEST_OWNER } from "@/lib/db/ids";
import { getLocalDb } from "@/lib/db/local";
import { createNotebook, updateNotebook } from "@/lib/db/notebooks-repo";
import type { NotebookRow } from "@/lib/db/types";
import {
  NOTEBOOK_COVERS,
  NOTEBOOK_NAME_MAX,
  NOTEBOOK_TAGS_MAX,
  nameConflict,
  presetCover,
  presetCoverRef,
} from "@/lib/notebooks/notebooks";
import { useOnlineStatus } from "@/lib/sync/hooks";
import { cn } from "@/lib/utils";
import { COVER_CLASSES, NotebookCover } from "./notebook-cover";

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive";

/** Tạo hoặc sửa sổ tay (bottom sheet). */
export function NotebookFormSheet({
  owner,
  notebooks,
  notebook,
  onClose,
  onSaved,
}: {
  owner: string;
  notebooks: NotebookRow[];
  /** Có thì sửa, không thì tạo mới. */
  notebook?: NotebookRow;
  onClose: () => void;
  onSaved: (row: NotebookRow) => void;
}) {
  const t = useTranslations("notebooks.form");
  const online = useOnlineStatus();
  const [name, setName] = useState(notebook?.name ?? "");
  const [description, setDescription] = useState(notebook?.description ?? "");
  const [tags, setTags] = useState<string[]>(notebook?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [cover, setCover] = useState<string | null>(notebook?.cover_url ?? null);
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "uploading" | "failed">("idle");

  const trimmed = name.trim();
  const conflict = trimmed ? nameConflict(trimmed, notebooks, notebook?.id) : null;
  const nameError = touched && !trimmed ? t("nameRequired") : null;
  const signedIn = owner !== GUEST_OWNER;
  const uploadedCover = cover?.startsWith("storage://") ? cover : null;

  function addTag() {
    const tag = tagDraft.trim().toLowerCase().slice(0, 30);
    if (tag && !tags.includes(tag) && tags.length < NOTEBOOK_TAGS_MAX) setTags([...tags, tag]);
    setTagDraft("");
  }

  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
  }

  async function upload(file: File) {
    setState("uploading");
    const result = await uploadUserImage(owner, file);
    setState(result.ok ? "idle" : "failed");
    if (result.ok) setCover(result.ref);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!trimmed || conflict) return;
    setState("saving");
    const input = { name: trimmed, description, tags, cover_url: cover };
    try {
      const row = notebook
        ? await updateNotebook(getLocalDb(), owner, notebook.id, input)
        : await createNotebook(getLocalDb(), owner, input);
      if (notebook?.cover_url && notebook.cover_url !== cover) {
        void removeUserImage(owner, notebook.cover_url);
      }
      onSaved(row);
      onClose();
    } catch {
      setState("failed");
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={notebook ? t("editTitle") : t("createTitle")}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("name")} *
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={NOTEBOOK_NAME_MAX}
            aria-invalid={!!nameError || !!conflict}
            autoFocus
            className={inputClass}
          />
        </label>
        {nameError && (
          <p className="-mt-2 text-sm text-destructive" role="alert">
            {nameError}
          </p>
        )}
        {conflict && (
          <div className="-mt-2 flex flex-col items-start gap-1" role="alert">
            <p className="text-sm text-destructive">
              {t("nameTaken", { suggestion: conflict.suggestion })}
            </p>
            <button
              type="button"
              onClick={() => setName(conflict.suggestion)}
              className="min-h-11 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("useSuggestion", { suggestion: conflict.suggestion })}
            </button>
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("description")}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="notebook-tag" className="text-sm font-medium">
            {t("tags")}
          </label>
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== tag))}
                    aria-label={t("removeTag", { tag })}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent px-3 text-sm text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {tag}
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id="notebook-tag"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={addTag}
            placeholder={t("tagPlaceholder")}
            disabled={tags.length >= NOTEBOOK_TAGS_MAX}
            className={inputClass}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t("cover")}</legend>
          <div className="grid grid-cols-5 gap-2">
            {NOTEBOOK_COVERS.map((preset, i) => {
              const selected = presetCover(cover) === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCover(presetCoverRef(preset))}
                  aria-label={t("coverPreset", { index: i + 1 })}
                  aria-pressed={selected}
                  className={cn(
                    "flex aspect-square min-h-11 items-center justify-center rounded-lg bg-gradient-to-br text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    COVER_CLASSES[preset],
                    selected && "ring-2 ring-foreground ring-offset-2",
                  )}
                >
                  {selected && <Check className="size-5" aria-hidden />}
                </button>
              );
            })}
            {signedIn && (
              <label
                className={cn(
                  "relative flex aspect-square min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-muted-foreground focus-within:outline-2 focus-within:outline-ring",
                  uploadedCover && "border-solid ring-2 ring-foreground ring-offset-2",
                  (!online || state === "uploading") && "pointer-events-none opacity-50",
                )}
              >
                {uploadedCover ? (
                  <NotebookCover
                    notebookId={notebook?.id ?? "new"}
                    coverUrl={uploadedCover}
                    owner={owner}
                    className="absolute inset-0"
                  />
                ) : (
                  <ImagePlus className="size-5" aria-hidden />
                )}
                <span className="sr-only">{t("coverUpload")}</span>
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
            )}
          </div>
        </fieldset>

        {state === "failed" && (
          <p className="text-sm text-destructive" role="alert">
            {t("failed")}
          </p>
        )}
        <Button
          type="submit"
          className="min-h-11"
          disabled={state === "saving" || state === "uploading"}
        >
          {state === "saving" ? t("saving") : notebook ? t("save") : t("create")}
        </Button>
      </form>
    </Sheet>
  );
}
