import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { GUEST_OWNER, cardId, userWordId } from "@/lib/db/ids";
import { LocalDb } from "@/lib/db/local";
import {
  addSensesToDefaultNotebook,
  adoptGuestData,
  recordReview,
  saveSettings,
} from "@/lib/db/repo";
import { cursorColumn, rowKey, type SyncRowMap, type SyncTable } from "@/lib/db/types";
import { SyncEngine } from "./engine";
import type { RemoteResult, SyncRemote } from "./remote";

const USER = "11111111-1111-4111-8111-111111111111";
const SENSE_A = "60db4402-ca9b-4997-baa8-ddd85db1b21d";
const SENSE_B = "a13fc340-7924-407d-818f-fb4c52573c3c";

/** Supabase giả trong bộ nhớ: giờ server tăng dần, thẻ không bị lùi, review_logs chỉ thêm. */
class FakeRemote implements SyncRemote {
  online = true;
  tables = new Map<SyncTable, Map<string, Record<string, unknown>>>();
  upsertCalls: Array<{ table: SyncTable; count: number }> = [];
  private clock = Date.parse("2026-10-20T00:00:00Z");

  private tick() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  table(name: SyncTable) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  private offline(): RemoteResult {
    return { ok: false, kind: "network", message: "Failed to fetch" };
  }

  async upsert<T extends SyncTable>(table: T, rows: SyncRowMap[T][]): Promise<RemoteResult> {
    if (!this.online) return this.offline();
    this.upsertCalls.push({ table, count: rows.length });
    const store = this.table(table);
    for (const row of rows) {
      const key = rowKey(table, row);
      const old = store.get(key) as Record<string, unknown> | undefined;
      if (table === "review_logs") {
        if (!old) store.set(key, { ...row, created_at: this.tick() });
        continue;
      }
      let next: Record<string, unknown> = { ...old, ...row };
      if (table === "cards" && old?.last_review) {
        const incoming = (row as SyncRowMap["cards"]).last_review;
        if (!incoming || incoming < (old.last_review as string)) {
          next = { ...old, deleted_at: (row as SyncRowMap["cards"]).deleted_at };
        }
      }
      store.set(key, { ...next, updated_at: this.tick() });
    }
    return { ok: true };
  }

  async updateSettings(userId: string, patch: Record<string, unknown>): Promise<RemoteResult> {
    if (!this.online) return this.offline();
    const store = this.table("user_settings");
    store.set(userId, { ...store.get(userId), ...patch, user_id: userId, updated_at: this.tick() });
    return { ok: true };
  }

  async pull<T extends SyncTable>(
    table: T,
    owner: string,
    since: string,
    offset: number,
    limit: number,
  ) {
    if (!this.online) return this.offline() as Extract<RemoteResult, { ok: false }>;
    const column = cursorColumn(table);
    const rows = [...this.table(table).values()]
      .filter((row) => row.user_id === owner && (row[column] as string) >= since)
      .sort((a, b) => (a[column] as string).localeCompare(b[column] as string))
      .slice(offset, offset + limit);
    return { ok: true as const, rows: rows as unknown as SyncRowMap[T][] };
  }

  async fetchWordContent() {
    return { ok: true as const, content: { words: [], senses: [], details: [] } };
  }
}

let dbCount = 0;
let db: LocalDb;
let remote: FakeRemote;
let engine: SyncEngine;

beforeEach(async () => {
  db = new LocalDb(`test-${++dbCount}`);
  remote = new FakeRemote();
  engine = new SyncEngine(db, remote);
  await engine.setOwner(USER);
});

afterEach(async () => {
  db.close();
});

describe("SyncEngine", () => {
  it("ghi trong máy trước, đồng bộ đẩy lên server và xóa outbox", async () => {
    await addSensesToDefaultNotebook(db, USER, [SENSE_A, SENSE_B], "Sổ của tôi");
    expect(await db.outbox.count()).toBeGreaterThan(0);

    const status = await engine.syncNow();
    expect(status).toMatchObject({ state: "idle", pending: 0, failed: 0 });
    expect(remote.table("user_words").size).toBe(2);
    expect(remote.table("cards").size).toBe(2);
    expect(remote.table("notebook_entries").size).toBe(1 * 2);
    expect(remote.table("notebooks").size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("offline: giữ trong hàng đợi, có mạng lại thì gửi", async () => {
    await addSensesToDefaultNotebook(db, USER, [SENSE_A], "Sổ của tôi");
    await engine.syncNow();

    remote.online = false;
    const card = cardId(userWordId(USER, SENSE_A), "meaning");
    await recordReview(db, USER, card, { rating: Rating.Good, mode: "flashcard" });
    await saveSettings(db, USER, { daily_new_limit: 15 });
    const offline = await engine.syncNow();
    expect(offline.state).toBe("offline");
    expect(offline.pending).toBe(3);
    expect(remote.table("review_logs").size).toBe(0);

    remote.online = true;
    const online = await engine.syncNow();
    expect(online).toMatchObject({ state: "idle", pending: 0 });
    expect(remote.table("review_logs").size).toBe(1);
    expect(remote.table("cards").get(card)).toMatchObject({ reps: 1 });
    expect(remote.table("user_settings").get(USER)).toMatchObject({ daily_new_limit: 15 });
  });

  it("đẩy theo lô tối đa 50 dòng", async () => {
    await addSensesToDefaultNotebook(db, USER, [SENSE_A], "Sổ của tôi");
    const card = cardId(userWordId(USER, SENSE_A), "meaning");
    for (let i = 0; i < 120; i++) {
      await recordReview(db, USER, card, {
        rating: Rating.Good,
        mode: "flashcard",
        reviewedAt: new Date(Date.parse("2026-10-20T00:00:00Z") + i * 86_400_000),
      });
    }
    await engine.syncNow();
    const logBatches = remote.upsertCalls
      .filter((c) => c.table === "review_logs")
      .map((c) => c.count);
    expect(logBatches).toEqual([50, 50, 20]);
    expect(remote.table("cards").get(card)).toMatchObject({ reps: 120 });
  });

  it("hai máy cùng ôn khi offline: không mất lượt ôn nào", async () => {
    // Máy A thêm từ và đồng bộ; máy B (DB khác) kéo về.
    await addSensesToDefaultNotebook(db, USER, [SENSE_A], "Sổ của tôi");
    await engine.syncNow();
    const dbB = new LocalDb(`test-${++dbCount}`);
    const engineB = new SyncEngine(dbB, remote);
    await engineB.setOwner(USER);
    await engineB.syncNow();
    const card = cardId(userWordId(USER, SENSE_A), "meaning");
    expect(await dbB.cards.get(card)).toBeDefined();

    // Cả hai offline, mỗi máy ôn một lần.
    remote.online = false;
    await recordReview(db, USER, card, {
      rating: Rating.Again,
      mode: "flashcard",
      reviewedAt: new Date("2026-10-21T08:00:00Z"),
    });
    await recordReview(dbB, USER, card, {
      rating: Rating.Good,
      mode: "flashcard",
      reviewedAt: new Date("2026-10-21T09:00:00Z"),
    });

    remote.online = true;
    await engineB.syncNow(); // B lên trước (lần ôn mới hơn)
    await engine.syncNow(); // A lên sau: server giữ thẻ của B, A tính lại từ 2 log
    await engineB.syncNow(); // B kéo bản đã tính lại

    expect(remote.table("review_logs").size).toBe(2);
    const server = remote.table("cards").get(card)!;
    expect(server.reps).toBe(2);
    expect(server.last_review).toBe("2026-10-21T09:00:00.000Z");
    expect(await db.cards.get(card)).toMatchObject({ reps: 2, due: server.due });
    expect(await dbB.cards.get(card)).toMatchObject({ reps: 2, due: server.due });
    dbB.close();
  });

  it("khách chỉ lưu trong máy; đăng nhập thì gộp vào tài khoản", async () => {
    await engine.setOwner(GUEST_OWNER);
    await saveSettings(db, GUEST_OWNER, { cefr_level: "B2", onboarded_at: "2026-10-20T01:00:00Z" });
    await addSensesToDefaultNotebook(db, GUEST_OWNER, [SENSE_A], "Sổ của tôi");
    expect((await engine.syncNow()).state).toBe("local");
    expect(remote.table("user_words").size).toBe(0);

    await engine.setOwner(USER);
    const result = await adoptGuestData(db, USER, { keepSettings: true });
    expect(result).toEqual({ moved: true, onboarded: true });
    await engine.syncNow();

    expect(remote.table("user_settings").get(USER)).toMatchObject({ cefr_level: "B2" });
    expect(remote.table("user_words").has(userWordId(USER, SENSE_A))).toBe(true);
    expect(await db.user_words.where("user_id").equals(GUEST_OWNER).count()).toBe(0);
  });

  it("tài khoản đã onboarding: không ghi đè cài đặt bằng cài đặt của khách", async () => {
    remote.table("user_settings").set(USER, {
      user_id: USER,
      cefr_level: "C1",
      onboarded_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    });
    await engine.syncNow();

    await engine.setOwner(GUEST_OWNER);
    await saveSettings(db, GUEST_OWNER, { cefr_level: "A1", onboarded_at: "2026-10-20T01:00:00Z" });
    await engine.setOwner(USER);
    await adoptGuestData(db, USER, { keepSettings: false });
    await engine.syncNow();
    expect(remote.table("user_settings").get(USER)).toMatchObject({ cefr_level: "C1" });
  });

  it("server từ chối nhiều lần thì gác lại và báo lỗi, không chặn việc khác", async () => {
    const failing: SyncRemote = {
      ...remote,
      upsert: async (table, rows) =>
        table === "notebooks"
          ? { ok: false, kind: "server", message: "violates row-level security" }
          : remote.upsert(table, rows),
      updateSettings: remote.updateSettings.bind(remote),
      pull: remote.pull.bind(remote),
      fetchWordContent: remote.fetchWordContent.bind(remote),
    };
    const flaky = new SyncEngine(db, failing);
    await flaky.setOwner(USER);
    await addSensesToDefaultNotebook(db, USER, [SENSE_A], "Sổ của tôi");
    await saveSettings(db, USER, { daily_new_limit: 20 });

    let status = await flaky.syncNow();
    expect(status.state).toBe("error");
    expect(remote.table("user_settings").get(USER)).toMatchObject({ daily_new_limit: 20 });
    for (let i = 0; i < 5; i++) status = await flaky.syncNow();
    expect(status.failed).toBeGreaterThan(0);
    const item = await db.outbox.where("owner").equals(USER).first();
    expect(item?.lastError).toContain("row-level security");
  });
});
