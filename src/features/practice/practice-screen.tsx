"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { usePersonalData } from "@/features/notebooks/use-personal-data";
import { getLocalDb } from "@/lib/db/local";
import { weightsOf } from "@/lib/db/repo";
import {
  DEFAULT_PRACTICE,
  PRACTICE_COUNTS,
  PRACTICE_MODES,
  PRACTICE_STATUSES,
  buildPractice,
  practiceQuery,
  practiceWords,
  type PracticeRequest,
} from "@/lib/review/practice";
import { createScheduler } from "@/lib/srs/scheduler";
import { GUEST_OWNER } from "@/lib/db/ids";
import { useOwner } from "@/lib/sync/owner";
import { cn } from "@/lib/utils";
import { radioGroupKeys } from "@/components/ui/radio-keys";

/**
 * Luyện tập tự chọn (Prompt 4.4): chọn phạm vi (sổ tay, chủ đề, trạng thái), chế độ và số câu rồi
 * vào phiên ôn. Chưa có "danh sách có chủ đích" (GĐ7).
 */
export function PracticeScreen() {
  const t = useTranslations("practice");
  const router = useRouter();
  const owner = useOwner();
  const data = usePersonalData(owner);
  const settings = useLiveQuery(
    async () => (owner ? getLocalDb().user_settings.get(owner) : undefined),
    [owner],
  );
  const [request, setRequest] = useState<PracticeRequest>(DEFAULT_PRACTICE);
  const set = (patch: Partial<PracticeRequest>) => setRequest({ ...request, ...patch });

  const view = useMemo(() => {
    if (!data) return null;
    const input = {
      userWords: data.userWords,
      cards: data.cards,
      entries: data.entries,
      practiceSpelling: settings?.practice_spelling ?? true,
    };
    const scheduler = createScheduler({
      desiredRetention: settings?.desired_retention,
      weights: weightsOf(settings),
    });
    const learned = practiceWords(input, { ...DEFAULT_PRACTICE }).length;
    // Chủ đề có trong sổ đang chọn.
    const tags = new Set<string>();
    for (const entry of data.entries) {
      if (entry.deleted_at) continue;
      if (request.notebookId && entry.notebook_id !== request.notebookId) continue;
      for (const tag of entry.tags ?? []) tags.add(tag);
    }
    const plan = buildPractice(input, request, scheduler, new Date());
    return {
      learned,
      notebooks: data.notebooks.filter((n) => !n.deleted_at),
      tags: [...tags].sort((a, b) => a.localeCompare(b)),
      // Chấm phát âm cần tài khoản.
      available: request.mode === "speaking" && owner === GUEST_OWNER ? 0 : plan.available,
    };
  }, [data, settings, request, owner]);

  if (!view) {
    return (
      <p className="py-16 text-center text-muted-foreground" role="status">
        {t("loading")}
      </p>
    );
  }

  if (view.learned === 0) {
    return (
      <EmptyState body={t("emptyBody")}>
        <Button asChild className="min-h-11">
          <Link href="/">{t("goToday")}</Link>
        </Button>
      </EmptyState>
    );
  }

  const count = Math.min(request.count, view.available);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      <Group label={t("notebook")}>
        <Chip selected={!request.notebookId} onClick={() => set({ notebookId: null, tag: null })}>
          {t("allNotebooks")}
        </Chip>
        {view.notebooks.map((notebook) => (
          <Chip
            key={notebook.id}
            selected={request.notebookId === notebook.id}
            onClick={() => set({ notebookId: notebook.id, tag: null })}
          >
            {notebook.name}
          </Chip>
        ))}
      </Group>

      {view.tags.length > 0 && (
        <Group label={t("tag")}>
          <Chip selected={!request.tag} onClick={() => set({ tag: null })}>
            {t("allTags")}
          </Chip>
          {view.tags.map((tag) => (
            <Chip key={tag} selected={request.tag === tag} onClick={() => set({ tag })}>
              {tag}
            </Chip>
          ))}
        </Group>
      )}

      <Group label={t("status")}>
        {PRACTICE_STATUSES.map((status) => (
          <Chip key={status} selected={request.status === status} onClick={() => set({ status })}>
            {t(`statuses.${status}`)}
          </Chip>
        ))}
      </Group>

      <Group label={t("mode")}>
        {PRACTICE_MODES.map((mode) => (
          <Chip key={mode} selected={request.mode === mode} onClick={() => set({ mode })}>
            {t(`modes.${mode}`)}
          </Chip>
        ))}
      </Group>

      <Group label={t("count")}>
        {PRACTICE_COUNTS.map((n) => (
          <Chip key={n} selected={request.count === n} onClick={() => set({ count: n })}>
            {t("countValue", { count: n })}
          </Chip>
        ))}
      </Group>

      <div className="flex flex-col gap-2">
        <p className="text-sm" role="status">
          {view.available > 0
            ? t("available", { available: view.available, count })
            : t(
                request.mode === "speaking"
                  ? owner === GUEST_OWNER
                    ? "speakingLogin"
                    : "noneSpeaking"
                  : request.mode === "writing"
                    ? "noneWriting"
                    : "none",
              )}
        </p>
        <Button
          className="min-h-12 text-base"
          disabled={view.available === 0}
          onClick={() => router.push(`/review/session?${practiceQuery(request)}`)}
        >
          {t("start")}
        </Button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h2>
      <div
        role="radiogroup"
        onKeyDown={radioGroupKeys}
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        {children}
      </div>
    </section>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 max-w-full items-center rounded-full border px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring",
        selected
          ? "border-primary bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground",
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}
