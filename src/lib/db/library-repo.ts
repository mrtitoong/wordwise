/**
 * Thêm danh sách Thư viện vào sổ tay, nhận bản cập nhật, đổi ngày mục tiêu (offline-first: Dexie +
 * outbox trong một transaction như repo.ts).
 */
import { NotebookInputSchema } from "@/lib/notebooks/notebooks";
import { subtopicTag } from "@/lib/library/library";
import { randomId } from "./ids";
import type { LocalDb } from "./local";
import { addSensesToNotebook, notifyWrite, personalTables, queue, type AddResult } from "./repo";
import type { NotebookRow } from "./types";

export type ListItem = {
  senseId: string;
  subtopic: string | null;
  contextSentence: string | null;
};

export type ListTarget =
  { kind: "existing"; notebookId: string } | { kind: "new"; name: string; coverUrl: string | null };

const listSource = (listId: string) => `list:${listId}`;

async function addItems(
  db: LocalDb,
  owner: string,
  notebookId: string,
  listId: string,
  items: readonly ListItem[],
  now: Date,
): Promise<AddResult> {
  return addSensesToNotebook(
    db,
    owner,
    items.map((item) => ({
      senseId: item.senseId,
      contextSentence: item.contextSentence,
      tags: subtopicTag(item.subtopic),
    })),
    { notebookId, inputMethod: "list", source: listSource(listId) },
    now,
  );
}

/**
 * Thêm các từ của danh sách (theo thứ tự Admin sắp) vào sổ có sẵn hoặc sổ mới, gắn danh sách, phiên
 * bản và ngày mục tiêu. Mọi thứ trong một transaction: lỗi thì không còn sổ rỗng.
 */
export async function addListToNotebook(
  db: LocalDb,
  owner: string,
  input: {
    listId: string;
    version: number;
    target: ListTarget;
    targetDate: string | null;
    items: readonly ListItem[];
  },
  now = new Date(),
): Promise<{ notebook: NotebookRow; result: AddResult }> {
  const iso = now.toISOString();
  return db.transaction("rw", personalTables(db), async () => {
    let notebook: NotebookRow;
    if (input.target.kind === "existing") {
      const current = await db.notebooks.get(input.target.notebookId);
      if (!current || current.user_id !== owner || current.deleted_at) {
        throw new Error(`Không có sổ ${input.target.notebookId}`);
      }
      notebook = current;
    } else {
      const parsed = NotebookInputSchema.parse({
        name: input.target.name.slice(0, 100),
        cover_url: input.target.coverUrl,
      });
      notebook = {
        id: randomId(),
        user_id: owner,
        language: "en",
        source_list_id: null,
        source_list_version: null,
        target_date: null,
        is_archived: false,
        deleted_at: null,
        created_at: iso,
        ...parsed,
        updated_at: iso,
      };
    }
    notebook = {
      ...notebook,
      source_list_id: input.listId,
      source_list_version: input.version,
      target_date: input.targetDate,
      updated_at: iso,
    };
    await db.notebooks.put(notebook);
    await queue(db, "notebooks", notebook.id, owner);
    const result = await addItems(db, owner, notebook.id, input.listId, input.items, now);
    return { notebook, result };
  });
}

/** "Nhận" từ mới của bản phát hành sau: thêm vào cuối sổ và ghi phiên bản đã nhận. */
export async function acceptListUpdate(
  db: LocalDb,
  owner: string,
  notebookId: string,
  version: number,
  items: readonly ListItem[],
  now = new Date(),
): Promise<AddResult> {
  return db.transaction("rw", personalTables(db), async () => {
    const notebook = await setReceivedVersion(db, owner, notebookId, version, now);
    return addItems(db, owner, notebookId, notebook.source_list_id!, items, now);
  });
}

/** "Bỏ qua" bản cập nhật: chỉ ghi phiên bản đã nhận để không hỏi lại. */
export async function skipListUpdate(
  db: LocalDb,
  owner: string,
  notebookId: string,
  version: number,
): Promise<void> {
  await db.transaction("rw", db.notebooks, db.outbox, () =>
    setReceivedVersion(db, owner, notebookId, version, new Date()),
  );
  notifyWrite();
}

async function setReceivedVersion(
  db: LocalDb,
  owner: string,
  notebookId: string,
  version: number,
  now: Date,
): Promise<NotebookRow> {
  const current = await db.notebooks.get(notebookId);
  if (!current || current.user_id !== owner || current.deleted_at || !current.source_list_id) {
    throw new Error(`Không có sổ theo danh sách ${notebookId}`);
  }
  const row = { ...current, source_list_version: version, updated_at: now.toISOString() };
  await db.notebooks.put(row);
  await queue(db, "notebooks", notebookId, owner);
  return row;
}

/** Đặt, đổi hoặc bỏ ngày mục tiêu của sổ (YYYY-MM-DD hoặc null). */
export async function setTargetDate(
  db: LocalDb,
  owner: string,
  notebookId: string,
  targetDate: string | null,
): Promise<void> {
  if (targetDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(`Ngày không hợp lệ: ${targetDate}`);
  }
  await db.transaction("rw", db.notebooks, db.outbox, async () => {
    const current = await db.notebooks.get(notebookId);
    if (!current || current.user_id !== owner || current.deleted_at) {
      throw new Error(`Không có sổ ${notebookId}`);
    }
    await db.notebooks.put({
      ...current,
      target_date: targetDate,
      updated_at: new Date().toISOString(),
    });
    await queue(db, "notebooks", notebookId, owner);
  });
  notifyWrite();
}
