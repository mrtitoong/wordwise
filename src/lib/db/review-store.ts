/**
 * Trạng thái phiên ôn chỉ giữ trong máy (bảng meta, không đồng bộ): phiên đang làm dở, các ngày
 * đã ôn hết hàng (tính chuỗi ngày học), số phiên của khách (gợi ý tạo tài khoản).
 */
import type { SavedSession } from "@/lib/review/session";
import type { LocalDb } from "./local";

const sessionKey = (owner: string) => `review:session:${owner}`;
const doneKey = (owner: string) => `review:done:${owner}`;
const countKey = (owner: string) => `review:sessions:${owner}`;

/** Giữ chừng này ngày gần nhất trong danh sách "đã ôn hết hàng". */
const DONE_DAYS_KEPT = 400;

async function readJson<T>(db: LocalDb, key: string): Promise<T | null> {
  const row = await db.meta.get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function getSavedSession(db: LocalDb, owner: string): Promise<SavedSession | null> {
  return readJson<SavedSession>(db, sessionKey(owner));
}

export async function saveSession(db: LocalDb, session: SavedSession): Promise<void> {
  await db.meta.put({ key: sessionKey(session.owner), value: JSON.stringify(session) });
}

export async function clearSession(db: LocalDb, owner: string): Promise<void> {
  await db.meta.delete(sessionKey(owner));
}

export async function completedDays(db: LocalDb, owner: string): Promise<Set<string>> {
  return new Set((await readJson<string[]>(db, doneKey(owner))) ?? []);
}

/** Ghi nhận ngày đã ôn hết hàng; đếm thêm một phiên hoàn thành. */
export async function markSessionFinished(
  db: LocalDb,
  owner: string,
  day: string,
  emptiedQueue: boolean,
): Promise<number> {
  return db.transaction("rw", db.meta, async () => {
    if (emptiedQueue) {
      const days = [...(await completedDays(db, owner)), day];
      const kept = [...new Set(days)].sort().slice(-DONE_DAYS_KEPT);
      await db.meta.put({ key: doneKey(owner), value: JSON.stringify(kept) });
    }
    const count = ((await readJson<number>(db, countKey(owner))) ?? 0) + 1;
    await db.meta.put({ key: countKey(owner), value: JSON.stringify(count) });
    return count;
  });
}

export async function finishedSessions(db: LocalDb, owner: string): Promise<number> {
  return (await readJson<number>(db, countKey(owner))) ?? 0;
}
