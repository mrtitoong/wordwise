import { GUEST_OWNER } from "@/lib/db/ids";
import type { LocalDb } from "@/lib/db/local";
import { cacheWordContent, weightsOf } from "@/lib/db/repo";
import {
  cursorColumn,
  rowKey,
  type CardRow,
  type OutboxItem,
  type SyncRowMap,
  type SyncTable,
  type UserSettingsRow,
} from "@/lib/db/types";
import { createScheduler } from "@/lib/srs/scheduler";
import { mergeCard, mergeRow } from "./merge";
import { MAX_PUSH_ATTEMPTS, planPush } from "./push-plan";
import type { RemoteResult, SyncRemote } from "./remote";

export type SyncState = "local" | "idle" | "syncing" | "offline" | "error";

export type SyncStatus = {
  /** local: khách (dữ liệu chỉ ở máy) hoặc chưa cấu hình Supabase. */
  state: SyncState;
  /** Số việc đang chờ gửi. */
  pending: number;
  /** Số việc server từ chối quá MAX_PUSH_ATTEMPTS lần (đã tạm gác). */
  failed: number;
  lastSyncedAt: string | null;
};

const PULL_PAGE_SIZE = 500;
/** Kéo review_logs trước cards: gộp thẻ cần đủ lịch sử ôn trong máy. */
const PULL_ORDER: readonly SyncTable[] = [
  "user_settings",
  "notebooks",
  "user_words",
  "notebook_entries",
  "review_logs",
  "cards",
];
/** Kéo lùi lại một khoảng để không sót dòng ghi muộn (transaction commit sau mốc). */
const PULL_OVERLAP_MS = 60_000;
const DEBOUNCE_MS = 2_000;
const INTERVAL_MS = 5 * 60_000;
const EPOCH = "1970-01-01T00:00:00.000Z";

type Listener = (status: SyncStatus) => void;

/**
 * Đồng bộ dữ liệu cá nhân giữa IndexedDB và Supabase: đẩy outbox theo lô 50
 * dòng, rồi kéo thay đổi theo updated_at (review_logs theo created_at).
 */
export class SyncEngine {
  /** null: chưa biết (đang đọc phiên đăng nhập). */
  private owner: string | null = null;
  private status: SyncStatus = { state: "local", pending: 0, failed: 0, lastSyncedAt: null };
  private listeners = new Set<Listener>();
  private running: Promise<SyncStatus> | null = null;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: LocalDb,
    private readonly remote: SyncRemote | null,
  ) {}

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getOwner(): string | null {
    return this.owner;
  }

  get canSync(): boolean {
    return this.remote !== null && this.owner !== null && this.owner !== GUEST_OWNER;
  }

  /** Đổi chủ dữ liệu: user id khi đăng nhập, GUEST_OWNER khi là khách. */
  async setOwner(owner: string): Promise<void> {
    this.owner = owner;
    await this.refresh(this.canSync ? "idle" : "local");
  }

  /** Gọi sau mỗi thao tác ghi: đợi 2 giây (gom nhiều thao tác) rồi đồng bộ. */
  schedule(delay = DEBOUNCE_MS): void {
    void this.refresh();
    if (!this.canSync) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  /** Đồng bộ ngay. Đang chạy thì chạy thêm một lượt sau lượt hiện tại. */
  syncNow(): Promise<SyncStatus> {
    if (!this.canSync) return this.refresh("local");
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.withLock(async () => {
      do {
        this.rerun = false;
        await this.runOnce();
      } while (this.rerun && this.status.state !== "offline");
      return this.status;
    }).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Gắn các lúc tự đồng bộ: có mạng lại, quay lại tab, mỗi 5 phút. Trả về hàm gỡ. */
  start(): () => void {
    const onOnline = () => void this.syncNow();
    const onOffline = () => void this.refresh("offline");
    const onVisible = () => {
      if (document.visibilityState === "visible") void this.syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => void this.syncNow(), INTERVAL_MS);
    void this.syncNow();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
      if (this.timer) clearTimeout(this.timer);
    };
  }

  // ---------- nội bộ ----------

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // Nhiều tab: chỉ một tab đồng bộ tại một thời điểm.
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request("wordwise-sync", fn);
    }
    return fn();
  }

  private async runOnce(): Promise<void> {
    const owner = this.owner;
    if (!owner) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await this.refresh("offline");
      return;
    }
    await this.refresh("syncing");

    const pushed = await this.push(owner);
    if (!pushed.ok && pushed.kind === "network") return this.finish(pushed);
    const pulled = await this.pull(owner);
    if (!pulled.ok) return this.finish(pulled);
    // Lỗi server ở bước này không chặn đồng bộ dữ liệu học (lần sau tải lại).
    const refreshed = await this.refreshEditedWords();
    if (!refreshed.ok && refreshed.kind === "network") return this.finish(refreshed);

    // Gộp thẻ có thể sinh việc mới (thẻ tính lại): gửi luôn trong lượt này.
    let again: RemoteResult = { ok: true };
    if ((await this.pendingItems(owner)).length > 0) again = await this.push(owner);
    if (!again.ok && again.kind === "network") return this.finish(again);

    this.status.lastSyncedAt = new Date().toISOString();
    await this.finish(!pushed.ok ? pushed : again);
  }

  private async finish(result: RemoteResult): Promise<void> {
    if (result.ok) await this.refresh("idle");
    else await this.refresh(result.kind === "network" ? "offline" : "error");
  }

  private pendingItems(owner: string): Promise<OutboxItem[]> {
    return this.db.outbox.where("owner").equals(owner).sortBy("seq");
  }

  private async push(owner: string): Promise<RemoteResult> {
    const items = await this.pendingItems(owner);
    let serverError: RemoteResult | null = null;

    for (const batch of planPush(items, owner)) {
      const result = await this.pushBatch(batch.table, batch.rowIds, batch.fields, owner);
      if (result.ok) {
        await this.db.outbox.bulkDelete(batch.seqs);
        continue;
      }
      if (result.kind === "network") return result;
      // Server từ chối (dữ liệu sai, RLS…): ghi lỗi, tăng số lần thử, đi tiếp lô khác.
      serverError = result;
      await this.db.outbox
        .where("seq")
        .anyOf(batch.seqs)
        .modify((item) => {
          item.attempts += 1;
          item.lastError = result.message;
        });
    }
    return serverError ?? { ok: true };
  }

  private async pushBatch(
    table: SyncTable,
    rowIds: string[],
    fields: Record<string, string[]>,
    owner: string,
  ): Promise<RemoteResult> {
    const remote = this.remote!;
    if (table === "user_settings") {
      const row = await this.db.user_settings.get(owner);
      const changed = fields[owner] ?? [];
      if (!row || changed.length === 0) return { ok: true };
      const patch = Object.fromEntries(
        changed.map((field) => [field, row[field as keyof UserSettingsRow]]),
      ) as Partial<UserSettingsRow>;
      return remote.updateSettings(owner, patch);
    }
    const rows = (await this.db.table(table).bulkGet(rowIds)).filter(
      (row): row is SyncRowMap[typeof table] => !!row && row.user_id === owner,
    );
    if (rows.length === 0) return { ok: true };
    return remote.upsert(table, rows);
  }

  private async pull(owner: string): Promise<RemoteResult> {
    for (const table of PULL_ORDER) {
      const cursorKey = `cursor:${owner}:${table}`;
      const cursor = (await this.db.meta.get(cursorKey))?.value;
      const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : EPOCH;
      let latest = cursor ?? EPOCH;

      for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
        const page = await this.remote!.pull(table, owner, since, offset, PULL_PAGE_SIZE);
        if (!page.ok) return page;
        await this.applyPulled(table, page.rows, owner);
        for (const row of page.rows) {
          const value = (row as Record<string, string | undefined>)[cursorColumn(table)];
          if (value && value > latest) latest = value;
        }
        if (table === "user_words")
          await this.cacheContent(page.rows as SyncRowMap["user_words"][]);
        if (page.rows.length < PULL_PAGE_SIZE) break;
      }
      await this.db.meta.put({ key: cursorKey, value: latest });
    }
    return { ok: true };
  }

  private async applyPulled<T extends SyncTable>(
    table: T,
    rows: SyncRowMap[T][],
    owner: string,
  ): Promise<void> {
    if (rows.length === 0) return;
    const db = this.db;
    await db.transaction(
      "rw",
      [db.table(table), db.outbox, db.review_logs, db.user_settings],
      async () => {
        const pending = new Set(
          (await db.outbox.where("owner").equals(owner).toArray())
            .filter((item) => item.table === table)
            .map((item) => item.rowId),
        );
        const store = db.table(table);
        const settings = await db.user_settings.get(owner);
        const scheduler = createScheduler({
          desiredRetention: settings?.desired_retention,
          weights: weightsOf(settings),
        });

        for (const remoteRow of rows) {
          const key = rowKey(table, remoteRow);
          const local = await store.get(key);
          const isPending = pending.has(key);

          if (table === "cards") {
            const logs = await db.review_logs.where("card_id").equals(key).toArray();
            const merged = mergeCard(local, remoteRow as CardRow, isPending, logs, scheduler);
            await store.put(merged.row);
            if (merged.needsPush && !isPending) {
              await db.outbox.add({
                table: "cards",
                rowId: key,
                owner,
                queuedAt: new Date().toISOString(),
                attempts: 0,
                lastError: null,
              });
            }
            continue;
          }
          const decision = mergeRow(local, remoteRow, isPending);
          if (decision.action === "put") await store.put(decision.row);
        }
      },
    );
  }

  /**
   * Admin sửa nội dung từ dùng chung (Prompt 7.3): tải lại các từ đã lưu trong máy có
   * content_updated_at mới hơn lần trước. Con trỏ dùng chung cho mọi tài khoản trên máy.
   */
  private async refreshEditedWords(): Promise<RemoteResult> {
    const cursorKey = "cursor:edited-words";
    const cursor = (await this.db.meta.get(cursorKey))?.value;
    const since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : EPOCH;
    let latest = cursor ?? EPOCH;
    const senseIds: string[] = [];
    for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
      const page = await this.remote!.editedWords(since, offset, PULL_PAGE_SIZE);
      if (!page.ok) return page;
      for (const word of page.rows) {
        if (word.contentUpdatedAt > latest) latest = word.contentUpdatedAt;
        const local = await this.db.words.get(word.id);
        if (local && local.content_updated_at !== word.contentUpdatedAt) {
          senseIds.push(...word.senseIds);
        }
      }
      if (page.rows.length < PULL_PAGE_SIZE) break;
    }
    for (let i = 0; i < senseIds.length; i += PULL_PAGE_SIZE) {
      const result = await this.remote!.fetchWordContent(senseIds.slice(i, i + PULL_PAGE_SIZE));
      if (!("content" in result)) return result;
      await cacheWordContent(this.db, result.content);
    }
    await this.db.meta.put({ key: cursorKey, value: latest });
    return { ok: true };
  }

  /** Lưu sẵn nội dung các từ vừa kéo về để xem/ôn được khi offline. */
  private async cacheContent(userWords: SyncRowMap["user_words"][]): Promise<void> {
    const missing: string[] = [];
    for (const uw of userWords) {
      if (!(await this.db.word_senses.get(uw.sense_id))) missing.push(uw.sense_id);
    }
    if (missing.length === 0) return;
    const result = await this.remote!.fetchWordContent(missing);
    if ("content" in result) await cacheWordContent(this.db, result.content);
  }

  private async refresh(state?: SyncState): Promise<SyncStatus> {
    const items = this.owner ? await this.pendingItems(this.owner) : [];
    const failed = items.filter((item) => item.attempts >= MAX_PUSH_ATTEMPTS).length;
    let next = state ?? this.status.state;
    // Còn việc bị server từ chối nhiều lần thì báo lỗi để người dùng biết.
    if (next === "idle" && failed > 0) next = "error";
    if (!this.canSync) next = "local";
    this.status = { ...this.status, state: next, pending: items.length, failed };
    for (const listener of this.listeners) listener(this.status);
    return this.status;
  }
}
