/**
 * Thao tác sổ tay trong máy (offline-first): tạo/sửa/lưu trữ/xóa sổ, chuyển/sao chép/xóa từ,
 * tạm ngưng. Mỗi thao tác ghi Dexie + outbox trong một transaction như repo.ts. Thao tác xóa
 * trả về bản chụp để Hoàn tác trong vài giây.
 */
import { planRemoval, NotebookInputSchema, type NotebookInput } from "@/lib/notebooks/notebooks";
import { defaultNotebookId, notebookEntryId, randomId } from "./ids";
import type { LocalDb } from "./local";
import { notifyWrite, personalTables, queue } from "./repo";
import type { CardRow, NotebookEntryRow, NotebookRow, UserWordRow } from "./types";

/** Các dòng trước khi sửa, để Hoàn tác. */
export type Snapshot = {
  notebooks: NotebookRow[];
  entries: NotebookEntryRow[];
  userWords: UserWordRow[];
  cards: CardRow[];
};

const emptySnapshot = (): Snapshot => ({ notebooks: [], entries: [], userWords: [], cards: [] });

async function ownedNotebook(db: LocalDb, owner: string, id: string): Promise<NotebookRow> {
  const notebook = await db.notebooks.get(id);
  if (!notebook || notebook.user_id !== owner || notebook.deleted_at) {
    throw new Error(`Không có sổ ${id}`);
  }
  return notebook;
}

export async function createNotebook(
  db: LocalDb,
  owner: string,
  input: NotebookInput,
): Promise<NotebookRow> {
  const parsed = NotebookInputSchema.parse(input);
  const iso = new Date().toISOString();
  const row: NotebookRow = {
    id: randomId(),
    user_id: owner,
    language: "en",
    source_list_id: null,
    target_date: null,
    is_archived: false,
    deleted_at: null,
    created_at: iso,
    updated_at: iso,
    ...parsed,
  };
  await db.transaction("rw", db.notebooks, db.outbox, async () => {
    await db.notebooks.put(row);
    await queue(db, "notebooks", row.id, owner);
  });
  notifyWrite();
  return row;
}

export async function updateNotebook(
  db: LocalDb,
  owner: string,
  id: string,
  patch: Partial<NotebookInput> & { is_archived?: boolean },
): Promise<NotebookRow> {
  const row = await db.transaction("rw", db.notebooks, db.outbox, async () => {
    const current = await ownedNotebook(db, owner, id);
    const { is_archived, ...fields } = patch;
    const merged = NotebookInputSchema.parse({
      name: current.name,
      description: current.description,
      tags: current.tags,
      cover_url: current.cover_url,
      ...fields,
    });
    const next: NotebookRow = {
      ...current,
      ...merged,
      is_archived: is_archived ?? current.is_archived,
      updated_at: new Date().toISOString(),
    };
    await db.notebooks.put(next);
    await queue(db, "notebooks", id, owner);
    return next;
  });
  notifyWrite();
  return row;
}

async function loadPersonal(db: LocalDb, owner: string) {
  const [notebooks, entries, userWords, cards] = await Promise.all([
    db.notebooks.where("user_id").equals(owner).toArray(),
    db.notebook_entries.where("user_id").equals(owner).toArray(),
    db.user_words.where("user_id").equals(owner).toArray(),
    db.cards.where("user_id").equals(owner).toArray(),
  ]);
  return { notebooks, entries, userWords, cards };
}

/**
 * Xóa mềm các mục khỏi sổ; từ không còn ở sổ nào thì xóa luôn từ và lịch ôn (thẻ).
 * Ghi vào snapshot các dòng bị đổi.
 */
async function removeEntriesTx(
  db: LocalDb,
  owner: string,
  entryIds: readonly string[],
  iso: string,
  snapshot: Snapshot,
) {
  const data = await loadPersonal(db, owner);
  const plan = planRemoval(data, entryIds);
  const ids = new Set(entryIds);
  for (const entry of data.entries) {
    if (!ids.has(entry.id) || entry.deleted_at) continue;
    snapshot.entries.push(entry);
    await db.notebook_entries.put({ ...entry, deleted_at: iso, updated_at: iso });
    await queue(db, "notebook_entries", entry.id, owner);
  }
  for (const userWordId of plan.drop) {
    const userWord = data.userWords.find((u) => u.id === userWordId);
    if (userWord && !userWord.deleted_at) {
      snapshot.userWords.push(userWord);
      await db.user_words.put({ ...userWord, deleted_at: iso, updated_at: iso });
      await queue(db, "user_words", userWord.id, owner);
    }
    for (const card of data.cards.filter((c) => c.user_word_id === userWordId && !c.deleted_at)) {
      snapshot.cards.push(card);
      await db.cards.put({ ...card, deleted_at: iso, updated_at: iso });
      await queue(db, "cards", card.id, owner);
    }
  }
}

export async function removeEntries(
  db: LocalDb,
  owner: string,
  entryIds: readonly string[],
): Promise<Snapshot> {
  const snapshot = emptySnapshot();
  await db.transaction("rw", personalTables(db), () =>
    removeEntriesTx(db, owner, entryIds, new Date().toISOString(), snapshot),
  );
  notifyWrite();
  return snapshot;
}

/** Xóa sổ (không xóa được "Sổ của tôi"); từ chỉ có ở sổ này bị xóa cùng lịch ôn. */
export async function deleteNotebook(db: LocalDb, owner: string, id: string): Promise<Snapshot> {
  if (id === defaultNotebookId(owner)) throw new Error("Không xóa được sổ mặc định");
  const snapshot = emptySnapshot();
  await db.transaction("rw", personalTables(db), async () => {
    const notebook = await ownedNotebook(db, owner, id);
    const iso = new Date().toISOString();
    const entries = await db.notebook_entries.where("notebook_id").equals(id).toArray();
    await removeEntriesTx(
      db,
      owner,
      entries.filter((e) => !e.deleted_at).map((e) => e.id),
      iso,
      snapshot,
    );
    snapshot.notebooks.push(notebook);
    await db.notebooks.put({ ...notebook, deleted_at: iso, updated_at: iso });
    await queue(db, "notebooks", id, owner);
  });
  notifyWrite();
  return snapshot;
}

/** Hoàn tác: ghi lại các dòng như trước khi xóa/sửa. */
export async function restoreSnapshot(db: LocalDb, owner: string, snapshot: Snapshot) {
  const iso = new Date().toISOString();
  await db.transaction("rw", personalTables(db), async () => {
    for (const [table, rows] of [
      ["notebooks", snapshot.notebooks],
      ["user_words", snapshot.userWords],
      ["notebook_entries", snapshot.entries],
      ["cards", snapshot.cards],
    ] as const) {
      for (const row of rows) {
        if (row.user_id !== owner) continue;
        await db.table(table).put({ ...row, updated_at: iso });
        await queue(db, table, row.id, owner);
      }
    }
  });
  notifyWrite();
}

/**
 * Chuyển hoặc sao chép mục sang sổ khác (giữ cách nhập, câu gốc, tag). Chuyển: xóa mục ở sổ cũ
 * (lịch ôn giữ nguyên vì từ vẫn ở sổ mới). Trả về số mục mới ở sổ đích.
 */
export async function copyEntries(
  db: LocalDb,
  owner: string,
  entryIds: readonly string[],
  targetNotebookId: string,
  { move }: { move: boolean },
): Promise<{ copied: number; snapshot: Snapshot }> {
  const snapshot = emptySnapshot();
  let copied = 0;
  await db.transaction("rw", personalTables(db), async () => {
    await ownedNotebook(db, owner, targetNotebookId);
    const iso = new Date().toISOString();
    const entries = (await db.notebook_entries.bulkGet([...entryIds])).filter(
      (e): e is NotebookEntryRow => !!e && e.user_id === owner && !e.deleted_at,
    );
    for (const entry of entries) {
      if (entry.notebook_id === targetNotebookId) continue;
      const id = notebookEntryId(targetNotebookId, entry.user_word_id);
      const existing = await db.notebook_entries.get(id);
      if (!existing || existing.deleted_at) {
        if (existing) snapshot.entries.push(existing);
        await db.notebook_entries.put({
          ...entry,
          id,
          notebook_id: targetNotebookId,
          added_at: iso,
          deleted_at: null,
          created_at: existing?.created_at ?? iso,
          updated_at: iso,
        });
        await queue(db, "notebook_entries", id, owner);
        copied++;
      }
      if (move) {
        snapshot.entries.push(entry);
        await db.notebook_entries.put({ ...entry, deleted_at: iso, updated_at: iso });
        await queue(db, "notebook_entries", entry.id, owner);
      }
    }
  });
  notifyWrite();
  return { copied, snapshot };
}

/** Tạm ngưng (không ôn) hoặc học lại các từ. Bỏ tạm ngưng: về Đang học nếu đã mở, không thì Sắp học. */
export async function setSuspended(
  db: LocalDb,
  owner: string,
  userWordIds: readonly string[],
  suspended: boolean,
): Promise<Snapshot> {
  const snapshot = emptySnapshot();
  await db.transaction("rw", db.user_words, db.outbox, async () => {
    const iso = new Date().toISOString();
    for (const row of await db.user_words.bulkGet([...new Set(userWordIds)])) {
      if (!row || row.user_id !== owner || row.deleted_at) continue;
      const status = suspended ? "suspended" : row.introduced_at ? "learning" : "queued";
      if (row.status === status) continue;
      snapshot.userWords.push(row);
      await db.user_words.put({ ...row, status, updated_at: iso });
      await queue(db, "user_words", row.id, owner);
    }
  });
  notifyWrite();
  return snapshot;
}
