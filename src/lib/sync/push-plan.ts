import { SYNC_TABLES, type OutboxItem, type SyncTable } from "@/lib/db/types";

export const PUSH_BATCH_SIZE = 50;
/** Lỗi từ server (không phải mất mạng) quá số lần này thì tạm gác, không chặn hàng đợi. */
export const MAX_PUSH_ATTEMPTS = 5;

export type PushBatch = {
  table: SyncTable;
  rowIds: string[];
  /** Các dòng outbox được xử lý bởi lô này (xóa khi gửi thành công). */
  seqs: number[];
  /** user_settings: cột cần gửi theo từng dòng. */
  fields: Record<string, string[]>;
};

/**
 * Gom outbox thành các lô (hàm thuần): theo thứ tự bảng cha → con để không vi
 * phạm khóa ngoại, mỗi dòng gửi một lần (bản mới nhất), tối đa 50 dòng/lô.
 */
export function planPush(items: readonly OutboxItem[], owner: string): PushBatch[] {
  const batches: PushBatch[] = [];
  for (const table of SYNC_TABLES) {
    const rows = new Map<string, { seqs: number[]; fields: Set<string> }>();
    for (const item of items) {
      if (item.table !== table || item.owner !== owner || item.seq === undefined) continue;
      if (item.attempts >= MAX_PUSH_ATTEMPTS) continue;
      const entry = rows.get(item.rowId) ?? { seqs: [], fields: new Set<string>() };
      entry.seqs.push(item.seq);
      for (const field of item.fields ?? []) entry.fields.add(field);
      rows.set(item.rowId, entry);
    }
    const ids = [...rows.keys()];
    for (let i = 0; i < ids.length; i += PUSH_BATCH_SIZE) {
      const chunk = ids.slice(i, i + PUSH_BATCH_SIZE);
      batches.push({
        table,
        rowIds: chunk,
        seqs: chunk.flatMap((id) => rows.get(id)!.seqs),
        fields: Object.fromEntries(chunk.map((id) => [id, [...rows.get(id)!.fields]])),
      });
    }
  }
  return batches;
}
