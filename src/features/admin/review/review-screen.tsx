"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BarChart3, Check, GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import {
  filterItems,
  moveById,
  moveItem,
  NO_FILTER,
  reviewProgress,
  subtopicsOf,
  type ReviewFilter,
  type ReviewItem,
} from "@/lib/admin/review";
import type { Pos } from "@/lib/schema/word";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../status-badge";
import {
  acceptItems,
  discardDraft,
  openDraft,
  publishList,
  removeItem,
  reorderItems,
} from "../review-actions";
import { ReviewPanel } from "./review-panel";
import { reviewErrorKey } from "./errors";
import { WarningChips } from "./warning-chips";

export type ReviewList = {
  id: string;
  title: string;
  status: string;
  version: number;
  /** Đã từng xuất bản (có phiên bản cho người học). */
  published: boolean;
};

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-accent-foreground";

/**
 * Màn duyệt danh sách /admin/lists/[id]/review (Prompt 7.3, ux-flows §3.13). Tối ưu cho máy tính;
 * điện thoại cuộn ngang bảng, đổi thứ tự bằng ô "Vị trí" trong khung chi tiết.
 */
export function ReviewScreen({
  list,
  initialItems,
}: {
  list: ReviewList;
  initialItems: ReviewItem[];
}) {
  const t = useTranslations("admin.review");
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<ReviewFilter>(NO_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editable = list.status === "draft" || list.status === "review";
  const visible = useMemo(() => filterItems(items, filter), [items, filter]);
  const progress = reviewProgress(items);
  const subtopics = useMemo(() => subtopicsOf(items), [items]);
  const filtered = visible.length !== items.length;
  const canDrag = editable && !filtered;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fail = (error: string) => showToast({ text: t(reviewErrorKey(error)) });

  /** Ghi thứ tự mới; lỗi thì trả lại thứ tự cũ. */
  const saveOrder = (next: ReviewItem[]) => {
    const before = items;
    setItems(next.map((item, order) => ({ ...item, order })));
    startTransition(async () => {
      const result = await reorderItems(
        list.id,
        next.map((i) => i.id),
      );
      if (!result.ok) {
        setItems(before);
        fail(result.error);
      }
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    saveOrder(moveById(items, String(active.id), String(over.id)));
  };

  const moveTo = (id: string, position: number) => {
    const from = items.findIndex((i) => i.id === id);
    if (from >= 0) saveOrder(moveItem(items, from, position - 1));
  };

  const setAccepted = (ids: string[], accepted: boolean) => {
    const before = items;
    setItems(items.map((i) => (ids.includes(i.id) ? { ...i, accepted } : i)));
    startTransition(async () => {
      const result = await acceptItems(list.id, ids, accepted);
      if (!result.ok) {
        setItems(before);
        fail(result.error);
      }
    });
  };

  const acceptClean = () =>
    startTransition(async () => {
      const result = await acceptItems(list.id, null, true);
      if (!result.ok) return fail(result.error);
      setItems((all) => all.map((i) => (i.warnings.length === 0 ? { ...i, accepted: true } : i)));
      showToast({ text: t("acceptedCount", { count: result.data.count }) });
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await removeItem(list.id, id);
      if (!result.ok) return fail(result.error);
      setSelectedId(null);
      setItems((all) => all.filter((i) => i.id !== id).map((item, order) => ({ ...item, order })));
      showToast({ text: t("removed") });
    });

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return fail(result.error ?? "failed");
      showToast({ text: done });
      router.refresh();
    });

  const updateItem = (next: ReviewItem) =>
    setItems((all) => all.map((i) => (i.id === next.id ? next : i)));

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link
          href={`/admin/lists/${list.id}`}
          className="inline-flex min-h-11 w-fit items-center text-sm text-muted-foreground hover:underline"
        >
          ← {list.title}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <StatusBadge status={list.status} />
          {list.published && (
            <span className="text-sm text-muted-foreground">
              {t("publishedVersion", { version: list.version })}
            </span>
          )}
        </div>
        <p className="text-sm" aria-live="polite">
          {t("progress", { accepted: progress.accepted, total: progress.total })}
          {" · "}
          {t("withWarnings", { count: progress.withWarnings })}
        </p>
        <div className="flex flex-wrap gap-2">
          {editable && progress.pendingClean > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={acceptClean}
            >
              <Check aria-hidden />
              {t("acceptClean", { count: progress.pendingClean })}
            </Button>
          )}
          {editable && (
            <Button
              type="button"
              className="min-h-11"
              disabled={pending || !progress.canPublish}
              onClick={() =>
                run(
                  () => publishList(list.id),
                  t("publishedToast", { version: list.published ? list.version + 1 : 1 }),
                )
              }
            >
              {list.published ? t("republish") : t("publish")}
            </Button>
          )}
          {editable && list.published && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => discardDraft(list.id), t("discarded"))}
            >
              {t("discard")}
            </Button>
          )}
          {list.status === "published" && (
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => openDraft(list.id), t("draftOpened"))}
            >
              {t("edit")}
            </Button>
          )}
          {list.published && (
            <Button asChild variant="ghost" className="min-h-11">
              <Link href={`/admin/lists/${list.id}/stats`}>
                <BarChart3 aria-hidden />
                {t("stats")}
              </Link>
            </Button>
          )}
        </div>
        {editable && !progress.canPublish && progress.total > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("publishHint", { count: progress.pending })}
          </p>
        )}
        {list.status === "published" && (
          <p className="text-sm text-muted-foreground">{t("publishedHint")}</p>
        )}
        {list.status === "processing" && (
          <p className="text-sm text-muted-foreground">{t("processingHint")}</p>
        )}
      </header>

      <div role="group" aria-label={t("filters")} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          aria-pressed={filter.warningsOnly}
          onClick={() => setFilter((f) => ({ ...f, warningsOnly: !f.warningsOnly }))}
        >
          {t("filterWarnings")}
        </button>
        <button
          type="button"
          className={chip}
          aria-pressed={filter.pendingOnly}
          onClick={() => setFilter((f) => ({ ...f, pendingOnly: !f.pendingOnly }))}
        >
          {t("filterPending")}
        </button>
        {subtopics.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("subtopic")}</span>
            <select
              className="min-h-11 rounded-md border bg-background px-2"
              value={filter.subtopic ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, subtopic: e.target.value || null }))}
            >
              <option value="">{t("allSubtopics")}</option>
              {subtopics.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {filtered && (
          <span className="text-sm text-muted-foreground">
            {t("shown", { shown: visible.length, total: items.length })}
            {editable && ` · ${t("dragDisabled")}`}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-12 px-2 py-2">
                    <span className="sr-only">{t("colDrag")}</span>
                  </th>
                  <th scope="col" className="w-12 px-2 py-2">
                    #
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t("colWord")}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t("colMeaning")}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    CEFR
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t("colSubtopic")}
                  </th>
                  <th scope="col" className="px-2 py-2">
                    {t("colWarnings")}
                  </th>
                  <th scope="col" className="w-28 px-2 py-2">
                    {t("colAccepted")}
                  </th>
                </tr>
              </thead>
              <SortableContext items={visible} strategy={verticalListSortingStrategy}>
                <tbody>
                  {visible.map((item) => (
                    <Row
                      key={item.id}
                      item={item}
                      draggable={canDrag}
                      editable={editable && !pending}
                      onOpen={() => setSelectedId(item.id)}
                      onAccept={(accepted) => setAccepted([item.id], accepted)}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </DndContext>
        </div>
      )}

      {selected && (
        <ReviewPanel
          key={selected.id}
          listId={list.id}
          item={selected}
          total={items.length}
          editable={editable}
          onClose={() => setSelectedId(null)}
          onChange={updateItem}
          onAccept={(accepted) => setAccepted([selected.id], accepted)}
          onMove={(position) => moveTo(selected.id, position)}
          onRemove={() => remove(selected.id)}
        />
      )}
    </main>
  );
}

function Row({
  item,
  draggable,
  editable,
  onOpen,
  onAccept,
}: {
  item: ReviewItem;
  draggable: boolean;
  editable: boolean;
  onOpen: () => void;
  onAccept: (accepted: boolean) => void;
}) {
  const t = useTranslations("admin.review");
  const tp = useTranslations("wordCard.pos");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !draggable });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-testid="review-row"
      className={cn(
        "border-t hover:bg-muted/40",
        isDragging && "relative z-10 bg-background shadow-md",
        item.accepted && "bg-green-50/60 dark:bg-green-950/20",
      )}
    >
      <td className="px-1 py-1">
        {draggable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("drag", { word: item.lemma })}
            className="flex size-11 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
      </td>
      <td className="px-2 py-1 text-muted-foreground tabular-nums">{item.order + 1}</td>
      <td className="px-2 py-1">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-11 flex-col items-start justify-center text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="font-medium text-primary underline-offset-2 hover:underline">
            {item.lemma}
          </span>
          <span className="text-xs text-muted-foreground">{tp(item.pos as Pos)}</span>
        </button>
      </td>
      <td className="max-w-64 px-2 py-1">
        {item.meaningVi}
        {item.senseCount > 1 && (
          <span className="ml-1 text-xs text-muted-foreground">
            {t("senseCount", { count: item.senseCount })}
          </span>
        )}
      </td>
      <td className="px-2 py-1">{item.cefr ?? "—"}</td>
      <td className="px-2 py-1">{item.subtopic ?? "—"}</td>
      <td className="px-2 py-1">
        <WarningChips warnings={item.warnings} />
      </td>
      <td className="px-2 py-1">
        <button
          type="button"
          disabled={!editable}
          aria-pressed={item.accepted}
          onClick={() => onAccept(!item.accepted)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 aria-pressed:border-green-600 aria-pressed:text-green-800 dark:aria-pressed:text-green-300"
        >
          {item.accepted && <Check className="size-4" aria-hidden />}
          {item.accepted ? t("accepted") : t("accept")}
        </button>
      </td>
    </tr>
  );
}
