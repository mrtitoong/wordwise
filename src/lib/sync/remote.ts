import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import {
  cursorColumn,
  type SyncRowMap,
  type SyncTable,
  type UserSettingsRow,
  type WordDetailsRow,
  type WordRow,
  type WordSenseRow,
} from "@/lib/db/types";

/** Kết quả gọi server: mất mạng thì dừng lượt đồng bộ, lỗi server thì ghi vào outbox. */
export type RemoteResult =
  { ok: true } | { ok: false; kind: "network" | "server"; message: string };
export type PullResult<T> = { ok: true; rows: T[] } | Extract<RemoteResult, { ok: false }>;

export type WordContent = { words: WordRow[]; senses: WordSenseRow[]; details: WordDetailsRow[] };

/** Phần server mà sync engine cần; bản thật dùng Supabase, test dùng bản giả. */
export interface SyncRemote {
  upsert<T extends SyncTable>(table: T, rows: SyncRowMap[T][]): Promise<RemoteResult>;
  updateSettings(userId: string, patch: Partial<UserSettingsRow>): Promise<RemoteResult>;
  pull<T extends SyncTable>(
    table: T,
    owner: string,
    since: string,
    offset: number,
    limit: number,
  ): Promise<PullResult<SyncRowMap[T]>>;
  fetchWordContent(senseIds: string[]): Promise<{ ok: true; content: WordContent } | RemoteResult>;
}

/** Cột server tự quản lý, không gửi từ máy khách. */
const SERVER_COLUMNS = new Set(["created_at", "updated_at"]);

function stripServerColumns<T extends object>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !SERVER_COLUMNS.has(key)),
  ) as Partial<T>;
}

type PostgrestLikeError = { message: string; code?: string } | null;

function classify(error: PostgrestLikeError, status: number): RemoteResult {
  if (!error) return { ok: true };
  // fetch hỏng (mất mạng, DNS…) trả status 0.
  const network = status === 0 || (typeof navigator !== "undefined" && navigator.onLine === false);
  return { ok: false, kind: network ? "network" : "server", message: error.message };
}

export function createSupabaseRemote(client: SupabaseClient<Database>): SyncRemote {
  return {
    async upsert(table, rows) {
      const payload = rows.map((row) => stripServerColumns(row));
      // review_logs chỉ thêm (không có quyền UPDATE): trùng id thì bỏ qua.
      const query =
        table === "review_logs"
          ? client
              .from(table)
              .upsert(payload as never, { onConflict: "id", ignoreDuplicates: true })
          : client.from(table).upsert(payload as never, {
              onConflict: table === "user_settings" ? "user_id" : "id",
            });
      const { error, status } = await query;
      return classify(error, status);
    },

    async updateSettings(userId, patch) {
      const { error, status } = await client
        .from("user_settings")
        .update(stripServerColumns(patch))
        .eq("user_id", userId);
      return classify(error, status);
    },

    async pull(table, owner, since, offset, limit) {
      const column = cursorColumn(table);
      // Bảng thay đổi theo tham số nên dùng client không gắn kiểu ở đây.
      const { data, error, status } = await (client as unknown as SupabaseClient)
        .from(table)
        .select("*")
        .eq("user_id", owner)
        .gte(column, since)
        .order(column)
        .order(table === "user_settings" ? "user_id" : "id")
        .range(offset, offset + limit - 1);
      const result = classify(error, status);
      if (!result.ok) return result;
      return { ok: true, rows: (data ?? []) as unknown as SyncRowMap[typeof table][] };
    },

    async fetchWordContent(senseIds) {
      const {
        data: senses,
        error,
        status,
      } = await client.from("word_senses").select("*").in("id", senseIds);
      if (error) return classify(error, status);
      const wordIds = [...new Set((senses ?? []).map((s) => s.word_id))];
      const [words, details] = await Promise.all([
        client.from("words").select("*").in("id", wordIds),
        client.from("word_details").select("*").in("sense_id", senseIds),
      ]);
      if (words.error) return classify(words.error, words.status);
      if (details.error) return classify(details.error, details.status);
      return {
        ok: true,
        content: { words: words.data ?? [], senses: senses ?? [], details: details.data ?? [] },
      };
    },
  };
}
