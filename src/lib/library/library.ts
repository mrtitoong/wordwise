/**
 * Thư viện (Prompt 7.4a): danh sách đã xuất bản, lọc, sổ đã thêm danh sách, từ mới của bản phát
 * hành sau. Hàm thuần, dùng chung cho trang Thư viện và chi tiết sổ tay.
 */
import { z } from "zod";
import { LIST_CEFR, LIST_PURPOSES, type ListPurpose } from "@/lib/admin/lists";
import type { NotebookRow } from "@/lib/db/types";

export const LibraryListSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  language: z.string(),
  target_cefr: z.enum(LIST_CEFR).nullable(),
  topic: z.string().nullable(),
  purpose: z
    .string()
    .nullable()
    .transform((p) =>
      p && (LIST_PURPOSES as readonly string[]).includes(p) ? (p as ListPurpose) : null,
    ),
  suggested_days: z.number().int().nullable(),
  cover_url: z.string().nullable(),
  version: z.number().int(),
  word_count: z.number().int(),
  published_at: z.string(),
  learner_count: z.number().int(),
  subtopics: z.array(z.string()).default([]),
});
export type LibraryList = z.output<typeof LibraryListSchema>;

/** Đọc kết quả hàm SQL library_lists(); dòng sai dạng thì bỏ. */
export function parseLibraryLists(data: unknown): LibraryList[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = LibraryListSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export type LibraryFilter = {
  language: string | null;
  cefr: string | null;
  purpose: ListPurpose | null;
};

export const NO_LIBRARY_FILTER: LibraryFilter = { language: null, cefr: null, purpose: null };

export function filterLibrary(lists: readonly LibraryList[], filter: LibraryFilter): LibraryList[] {
  return lists.filter(
    (l) =>
      (!filter.language || l.language === filter.language) &&
      (!filter.cefr || l.target_cefr === filter.cefr) &&
      (!filter.purpose || l.purpose === filter.purpose),
  );
}

/** Giá trị có trong Thư viện, để chỉ hiện chip lọc có kết quả (theo thứ tự cố định). */
export function libraryFacets(lists: readonly LibraryList[]) {
  const has = <T extends string>(all: readonly T[], values: (string | null)[]) =>
    all.filter((v) => values.includes(v));
  return {
    languages: [...new Set(lists.map((l) => l.language))].sort(),
    cefr: has(
      LIST_CEFR,
      lists.map((l) => l.target_cefr),
    ),
    purposes: has(
      LIST_PURPOSES,
      lists.map((l) => l.purpose),
    ),
  };
}

type NotebookLike = Pick<NotebookRow, "id" | "source_list_id" | "deleted_at">;

/** Sổ đã thêm danh sách này (mỗi danh sách một sổ). */
export function notebookForList<T extends NotebookLike>(
  notebooks: readonly T[],
  listId: string,
): T | null {
  return notebooks.find((n) => !n.deleted_at && n.source_list_id === listId) ?? null;
}

/** Sổ chọn được làm sổ đích: chưa gắn danh sách nào, không phải "Sổ của tôi", chưa lưu trữ. */
export function targetNotebooks<T extends NotebookLike & Pick<NotebookRow, "is_archived">>(
  notebooks: readonly T[],
  defaultNotebookId: string,
): T[] {
  return notebooks.filter(
    (n) => !n.deleted_at && !n.is_archived && !n.source_list_id && n.id !== defaultNotebookId,
  );
}

export type ReleaseInfo = { version: number; added_sense_ids: string[] };

/**
 * Từ mới của các bản phát hành sau bản sổ đã nhận: nghĩa được thêm ở bản > `receivedVersion`, vẫn
 * còn ở bản mới nhất và chưa có trong sổ. Theo thứ tự trong bản mới nhất.
 */
export function pendingListWords(input: {
  releases: readonly ReleaseInfo[];
  receivedVersion: number;
  latestSenseIds: readonly string[];
  notebookSenseIds: ReadonlySet<string>;
}): string[] {
  const added = new Set(
    input.releases
      .filter((r) => r.version > input.receivedVersion)
      .flatMap((r) => r.added_sense_ids),
  );
  return input.latestSenseIds.filter((id) => added.has(id) && !input.notebookSenseIds.has(id));
}

/** Tag cho mục trong sổ từ chủ đề con của danh sách (lọc, luyện theo chủ đề). */
export function subtopicTag(subtopic: string | null | undefined): string[] {
  const tag = subtopic?.trim().slice(0, 50);
  return tag ? [tag] : [];
}
