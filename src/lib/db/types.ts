import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

/** Dòng lưu ở máy có cùng dạng với dòng trên Supabase (tên cột snake_case). */
export type UserSettingsRow = Tables["user_settings"]["Row"];
export type NotebookRow = Tables["notebooks"]["Row"];
export type UserWordRow = Tables["user_words"]["Row"];
export type NotebookEntryRow = Tables["notebook_entries"]["Row"];
export type CardRow = Tables["cards"]["Row"];
export type ReviewLogRow = Tables["review_logs"]["Row"];
export type WordRow = Tables["words"]["Row"];
export type WordSenseRow = Tables["word_senses"]["Row"];
export type WordDetailsRow = Tables["word_details"]["Row"];

/** Bảng dữ liệu cá nhân được đồng bộ, theo thứ tự khóa ngoại (cha trước con). */
export const SYNC_TABLES = [
  "user_settings",
  "notebooks",
  "user_words",
  "notebook_entries",
  "cards",
  "review_logs",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export type SyncRowMap = {
  user_settings: UserSettingsRow;
  notebooks: NotebookRow;
  user_words: UserWordRow;
  notebook_entries: NotebookEntryRow;
  cards: CardRow;
  review_logs: ReviewLogRow;
};

/** Khóa chính của từng bảng (user_settings dùng user_id). */
export function rowKey<T extends SyncTable>(table: T, row: SyncRowMap[T]): string {
  return table === "user_settings" ? (row as UserSettingsRow).user_id : (row as { id: string }).id;
}

/** Cột thời gian server đặt, dùng để kéo thay đổi (review_logs chỉ thêm nên dùng created_at). */
export function cursorColumn(table: SyncTable): "updated_at" | "created_at" {
  return table === "review_logs" ? "created_at" : "updated_at";
}

/** Việc chờ gửi lên server. Chỉ lưu khóa dòng: lúc gửi đọc bản mới nhất trong máy. */
export type OutboxItem = {
  seq?: number;
  table: SyncTable;
  rowId: string;
  owner: string;
  /** user_settings: chỉ gửi các cột đã đổi để không ghi đè cột máy khác vừa sửa. */
  fields?: string[];
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};
