import Dexie, { type EntityTable } from "dexie";
import type { ImportRecord } from "@/lib/entry/import-record";
import type {
  CardRow,
  NotebookEntryRow,
  NotebookRow,
  OutboxItem,
  ReviewLogRow,
  UserSettingsRow,
  UserWordRow,
  WordDetailsRow,
  WordRow,
  WordSenseRow,
} from "./types";

export type MetaEntry = { key: string; value: string };

/**
 * IndexedDB trên máy (offline-first). Mọi thao tác ghi vào đây trước, kèm một
 * dòng outbox; sync engine (lib/sync) gửi lên Supabase sau.
 */
export class LocalDb extends Dexie {
  user_settings!: EntityTable<UserSettingsRow, "user_id">;
  notebooks!: EntityTable<NotebookRow, "id">;
  user_words!: EntityTable<UserWordRow, "id">;
  notebook_entries!: EntityTable<NotebookEntryRow, "id">;
  cards!: EntityTable<CardRow, "id">;
  review_logs!: EntityTable<ReviewLogRow, "id">;
  /** Bản sao nội dung từ đã dùng (dùng chung, chỉ đọc). */
  words!: EntityTable<WordRow, "id">;
  word_senses!: EntityTable<WordSenseRow, "id">;
  word_details!: EntityTable<WordDetailsRow, "sense_id">;
  outbox!: EntityTable<OutboxItem, "seq">;
  /** Mốc kéo dữ liệu theo bảng, chủ dữ liệu hiện tại… */
  meta!: EntityTable<MetaEntry, "key">;
  /** Việc nhập từ file đang chạy/chờ (chỉ trong máy, Prompt 2.4b). */
  imports!: EntityTable<ImportRecord, "id">;

  constructor(name = "wordwise") {
    super(name);
    this.version(1).stores({
      user_settings: "user_id",
      notebooks: "id, user_id",
      user_words: "id, user_id, sense_id",
      notebook_entries: "id, user_id, notebook_id, user_word_id",
      cards: "id, user_id, user_word_id, [user_id+due]",
      review_logs: "id, user_id, card_id",
      words: "id",
      word_senses: "id, word_id",
      word_details: "sense_id",
      outbox: "++seq, owner, [table+rowId]",
      meta: "key",
    });
    this.version(2).stores({ imports: "id, owner" });
  }
}

let instance: LocalDb | null = null;

/** Một DB dùng chung trong trình duyệt. Không gọi ở server. */
export function getLocalDb(): LocalDb {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB chỉ có trong trình duyệt");
  }
  instance ??= new LocalDb();
  return instance;
}

/** Xóa sạch dữ liệu trên máy (khi đăng xuất). */
export async function wipeLocalDb(db: LocalDb): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}
