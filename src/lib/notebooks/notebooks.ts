/**
 * Sổ tay: kiểm tra tên, bìa có sẵn, thống kê từng sổ, kế hoạch xóa từ khỏi sổ, lọc danh sách.
 * Hàm thuần, không phụ thuộc React hay Dexie.
 */
import { z } from "zod";
import type { CardRow, NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import { isDue, learningStatus, masteryLevel, type LearningStatus } from "./progress";

/* ---------- Tên, mô tả, tag ---------- */

export const NOTEBOOK_NAME_MAX = 100;
export const NOTEBOOK_TAGS_MAX = 10;

export const NotebookInputSchema = z.object({
  name: z.string().trim().min(1).max(NOTEBOOK_NAME_MAX),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((s) => (s ? s : null)),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(30))
    .max(NOTEBOOK_TAGS_MAX)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  cover_url: z
    .string()
    .max(300)
    .nullish()
    .transform((s) => s ?? null),
});

export type NotebookInput = z.input<typeof NotebookInputSchema>;

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("vi") === b.trim().toLocaleLowerCase("vi");

/** null nếu tên dùng được; nếu trùng, gợi ý "Tên (2)", "Tên (3)"… */
export function nameConflict(
  name: string,
  notebooks: readonly Pick<NotebookRow, "id" | "name" | "deleted_at">[],
  exceptId?: string,
): { suggestion: string } | null {
  const live = notebooks.filter((n) => !n.deleted_at && n.id !== exceptId);
  if (!live.some((n) => sameName(n.name, name))) return null;
  const base = name.trim();
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!live.some((n) => sameName(n.name, candidate))) return { suggestion: candidate };
  }
}

/* ---------- Bìa có sẵn ---------- */

export const NOTEBOOK_COVERS = [
  "teal",
  "sky",
  "violet",
  "rose",
  "amber",
  "lime",
  "slate",
  "orange",
] as const;
export type NotebookCover = (typeof NOTEBOOK_COVERS)[number];

const PRESET_PREFIX = "preset:";

export function presetCoverRef(cover: NotebookCover): string {
  return PRESET_PREFIX + cover;
}

/** Bìa có sẵn từ cover_url; ảnh tải lên (storage://…) hoặc trống thì null. */
export function presetCover(coverUrl: string | null | undefined): NotebookCover | null {
  if (!coverUrl?.startsWith(PRESET_PREFIX)) return null;
  const name = coverUrl.slice(PRESET_PREFIX.length);
  return (NOTEBOOK_COVERS as readonly string[]).includes(name) ? (name as NotebookCover) : null;
}

/** Bìa mặc định ổn định theo id sổ (sổ chưa chọn bìa không đổi màu mỗi lần mở). */
export function defaultCover(notebookId: string): NotebookCover {
  let hash = 0;
  for (const ch of notebookId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return NOTEBOOK_COVERS[Math.abs(hash) % NOTEBOOK_COVERS.length]!;
}

/* ---------- Dữ liệu một từ trong sổ ---------- */

export type PersonalData = {
  notebooks: NotebookRow[];
  entries: NotebookEntryRow[];
  userWords: UserWordRow[];
  /** Thẻ "meaning" của từng user_words. */
  cards: CardRow[];
};

function liveIndex(data: PersonalData) {
  const userWords = new Map(data.userWords.filter((u) => !u.deleted_at).map((u) => [u.id, u]));
  const cards = new Map(
    data.cards
      .filter((c) => !c.deleted_at && c.skill === "meaning")
      .map((c) => [c.user_word_id, c]),
  );
  const entries = data.entries.filter((e) => !e.deleted_at && userWords.has(e.user_word_id));
  return { userWords, cards, entries };
}

export type NotebookSummary = {
  notebook: NotebookRow;
  wordCount: number;
  dueCount: number;
};

/** Số từ và số từ đến hạn của từng sổ chưa xóa; sổ mặc định đứng cuối như wireframe. */
export function summarizeNotebooks(
  data: PersonalData,
  now: Date,
  defaultNotebookId?: string,
): NotebookSummary[] {
  const { userWords, cards, entries } = liveIndex(data);
  const byNotebook = new Map<string, { words: number; due: number }>();
  for (const entry of entries) {
    const stat = byNotebook.get(entry.notebook_id) ?? { words: 0, due: 0 };
    stat.words++;
    const uw = userWords.get(entry.user_word_id)!;
    if (isDue(uw, cards.get(uw.id), now)) stat.due++;
    byNotebook.set(entry.notebook_id, stat);
  }
  return data.notebooks
    .filter((n) => !n.deleted_at)
    .map((notebook) => ({
      notebook,
      wordCount: byNotebook.get(notebook.id)?.words ?? 0,
      dueCount: byNotebook.get(notebook.id)?.due ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(a.notebook.id === defaultNotebookId) - Number(b.notebook.id === defaultNotebookId) ||
        b.notebook.updated_at.localeCompare(a.notebook.updated_at),
    );
}

/** Số từ khác nhau trong toàn bộ kho (một từ có thể ở nhiều sổ). */
export function countOwnedWords(data: PersonalData): number {
  const { entries } = liveIndex(data);
  return new Set(entries.map((e) => e.user_word_id)).size;
}

export type EntryRow = {
  entry: NotebookEntryRow;
  userWord: UserWordRow;
  card: CardRow | null;
  status: LearningStatus;
  level: 0 | 1 | 2 | 3 | 4;
};

/** Các từ trong một sổ, mới thêm trước. */
export function notebookEntries(data: PersonalData, notebookId: string): EntryRow[] {
  const { userWords, cards, entries } = liveIndex(data);
  return entries
    .filter((e) => e.notebook_id === notebookId)
    .map((entry) => {
      const userWord = userWords.get(entry.user_word_id)!;
      const card = cards.get(userWord.id) ?? null;
      return {
        entry,
        userWord,
        card,
        status: learningStatus(userWord, card),
        level: masteryLevel(card),
      };
    })
    .sort(
      (a, b) =>
        b.entry.added_at.localeCompare(a.entry.added_at) || a.entry.id.localeCompare(b.entry.id),
    );
}

/* ---------- Lọc ---------- */

export type EntryFilter = {
  status: LearningStatus | "all";
  tag: string | null;
  inputMethod: NotebookEntryRow["input_method"] | null;
};

export const NO_FILTER: EntryFilter = { status: "all", tag: null, inputMethod: null };

export function filterEntries(rows: readonly EntryRow[], filter: EntryFilter): EntryRow[] {
  return rows.filter(
    (row) =>
      (filter.status === "all" || row.status === filter.status) &&
      (!filter.tag || (row.entry.tags ?? []).includes(filter.tag)) &&
      (!filter.inputMethod || row.entry.input_method === filter.inputMethod),
  );
}

export function countByStatus(rows: readonly EntryRow[]): Record<LearningStatus | "all", number> {
  const counts = { all: rows.length, queued: 0, learning: 0, known: 0, mastered: 0, suspended: 0 };
  for (const row of rows) counts[row.status]++;
  return counts;
}

/** Tag và cách nhập có trong sổ (để hiện chip lọc). */
export function filterOptions(rows: readonly EntryRow[]) {
  const tags = new Set<string>();
  const methods = new Set<NotebookEntryRow["input_method"]>();
  for (const row of rows) {
    for (const tag of row.entry.tags ?? []) tags.add(tag);
    methods.add(row.entry.input_method);
  }
  return { tags: [...tags].sort(), inputMethods: [...methods].sort() };
}

/* ---------- Xóa từ khỏi sổ ---------- */

export type RemovalPlan = {
  /** Từ còn trong sổ khác → giữ lịch ôn (kèm tên sổ). */
  keep: { userWordId: string; notebookNames: string[] }[];
  /** Từ không còn ở sổ nào → xóa cả lịch ôn. */
  drop: string[];
};

export function planRemoval(data: PersonalData, entryIds: readonly string[]): RemovalPlan {
  const { entries } = liveIndex(data);
  const removing = new Set(entryIds);
  const names = new Map(data.notebooks.filter((n) => !n.deleted_at).map((n) => [n.id, n.name]));
  const affected = [
    ...new Set(entries.filter((e) => removing.has(e.id)).map((e) => e.user_word_id)),
  ];
  const plan: RemovalPlan = { keep: [], drop: [] };
  for (const userWordId of affected) {
    const others = entries
      .filter(
        (e) => e.user_word_id === userWordId && !removing.has(e.id) && names.has(e.notebook_id),
      )
      .map((e) => names.get(e.notebook_id)!);
    if (others.length > 0)
      plan.keep.push({ userWordId, notebookNames: [...new Set(others)].sort() });
    else plan.drop.push(userWordId);
  }
  return plan;
}
