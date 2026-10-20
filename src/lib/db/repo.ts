import type { Grade } from "ts-fsrs";
import { applyReview, createScheduler, newCardFields } from "@/lib/srs/scheduler";
import { mergeCard } from "@/lib/sync/merge";
import { rekeyOwnedData } from "@/lib/sync/rekey";
import type { WordContent } from "@/lib/sync/remote";
import {
  GUEST_OWNER,
  cardId,
  defaultNotebookId,
  notebookEntryId,
  randomId,
  userWordId,
} from "./ids";
import type { LocalDb } from "./local";
import type { CardRow, OutboxItem, ReviewLogRow, SyncTable, UserSettingsRow } from "./types";

/**
 * Các thao tác ghi dữ liệu cá nhân. Mỗi thao tác ghi bản trong máy và thêm việc
 * vào outbox trong cùng một transaction, rồi báo cho sync engine (onLocalWrite).
 */
let writeListener: (() => void) | null = null;

export function onLocalWrite(listener: (() => void) | null): void {
  writeListener = listener;
}

function notifyWrite() {
  writeListener?.();
}

const SYNC_STORES = [
  "user_settings",
  "notebooks",
  "user_words",
  "notebook_entries",
  "cards",
  "review_logs",
  "outbox",
] as const;

function personalTables(db: LocalDb) {
  return SYNC_STORES.map((name) => db.table(name));
}

async function queue(
  db: LocalDb,
  table: SyncTable,
  rowId: string,
  owner: string,
  fields?: string[],
): Promise<void> {
  const item: OutboxItem = {
    table,
    rowId,
    owner,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    ...(fields ? { fields } : {}),
  };
  await db.outbox.add(item);
}

export function defaultSettingsRow(owner: string, now = new Date()): UserSettingsRow {
  const iso = now.toISOString();
  return {
    user_id: owner,
    target_language: "en",
    ui_locale: "vi",
    cefr_level: null,
    goals: [],
    daily_new_limit: 10,
    daily_review_limit: 200,
    desired_retention: 0.9,
    fsrs_params: null,
    reminder_time: null,
    timezone: "Asia/Ho_Chi_Minh",
    accent: "us",
    onboarded_at: null,
    created_at: iso,
    updated_at: iso,
  };
}

type SettingsPatch = Partial<Omit<UserSettingsRow, "user_id" | "created_at" | "updated_at">>;

/** Đổi cài đặt; chỉ các cột đã đổi được gửi lên. */
export async function saveSettings(
  db: LocalDb,
  owner: string,
  patch: SettingsPatch,
): Promise<void> {
  await db.transaction("rw", db.user_settings, db.outbox, async () => {
    const current = (await db.user_settings.get(owner)) ?? defaultSettingsRow(owner);
    await db.user_settings.put({ ...current, ...patch, updated_at: new Date().toISOString() });
    await queue(db, "user_settings", owner, owner, Object.keys(patch));
  });
  notifyWrite();
}

/** Lưu nội dung từ (dùng chung) vào bộ nhớ đệm trong máy. */
export async function cacheWordContent(db: LocalDb, content: WordContent): Promise<void> {
  await db.transaction("rw", db.words, db.word_senses, db.word_details, async () => {
    await db.words.bulkPut(content.words);
    await db.word_senses.bulkPut(content.senses);
    await db.word_details.bulkPut(content.details);
  });
}

/**
 * Thêm các nghĩa vào sổ tay mặc định ("Sổ của tôi", tạo nếu chưa có), mỗi từ
 * kèm một thẻ ôn "nghĩa". Từ đã có thì giữ nguyên lịch ôn.
 */
export async function addSensesToDefaultNotebook(
  db: LocalDb,
  owner: string,
  senseIds: readonly string[],
  notebookName: string,
  inputMethod: "typed" | "voice" | "photo" | "csv" | "list" = "list",
  source: string | null = "starter",
): Promise<void> {
  const now = new Date();
  const iso = now.toISOString();
  await db.transaction("rw", personalTables(db), async () => {
    const notebookId = defaultNotebookId(owner);
    if (!(await db.notebooks.get(notebookId))) {
      await db.notebooks.put({
        id: notebookId,
        user_id: owner,
        name: notebookName,
        language: "en",
        description: null,
        cover_url: null,
        tags: [],
        source_list_id: null,
        target_date: null,
        is_archived: false,
        deleted_at: null,
        created_at: iso,
        updated_at: iso,
      });
      await queue(db, "notebooks", notebookId, owner);
    }

    for (const senseId of new Set(senseIds)) {
      const uwId = userWordId(owner, senseId);
      const existing = await db.user_words.get(uwId);
      if (!existing || existing.deleted_at) {
        await db.user_words.put({
          id: uwId,
          user_id: owner,
          sense_id: senseId,
          custom_meaning: existing?.custom_meaning ?? null,
          custom_note: existing?.custom_note ?? null,
          custom_image_url: existing?.custom_image_url ?? null,
          user_additions: existing?.user_additions ?? {},
          status: "queued",
          added_at: existing?.added_at ?? iso,
          deleted_at: null,
          created_at: existing?.created_at ?? iso,
          updated_at: iso,
        });
        await queue(db, "user_words", uwId, owner);
      }

      const entryId = notebookEntryId(notebookId, uwId);
      const entry = await db.notebook_entries.get(entryId);
      if (!entry || entry.deleted_at) {
        await db.notebook_entries.put({
          id: entryId,
          user_id: owner,
          notebook_id: notebookId,
          user_word_id: uwId,
          input_method: inputMethod,
          context_sentence: null,
          context_image_url: null,
          source,
          added_at: iso,
          deleted_at: null,
          created_at: entry?.created_at ?? iso,
          updated_at: iso,
        });
        await queue(db, "notebook_entries", entryId, owner);
      }

      const meaningCardId = cardId(uwId, "meaning");
      const card = await db.cards.get(meaningCardId);
      if (!card || card.deleted_at) {
        await db.cards.put(
          card
            ? { ...card, deleted_at: null, updated_at: iso }
            : {
                id: meaningCardId,
                user_id: owner,
                user_word_id: uwId,
                skill: "meaning",
                ...newCardFields(now),
                deleted_at: null,
                created_at: iso,
                updated_at: iso,
              },
        );
        await queue(db, "cards", meaningCardId, owner);
      }
    }
  });
  notifyWrite();
}

/** Ghi một lượt ôn: cập nhật thẻ và thêm review_logs (chỉ thêm), cùng một transaction. */
export async function recordReview(
  db: LocalDb,
  owner: string,
  cardIdValue: string,
  input: { rating: Grade; mode: ReviewLogRow["mode"]; reviewedAt?: Date; responseMs?: number },
): Promise<{ card: CardRow; log: ReviewLogRow }> {
  const result = await db.transaction("rw", personalTables(db), async () => {
    const card = await db.cards.get(cardIdValue);
    if (!card || card.user_id !== owner) throw new Error(`Không có thẻ ${cardIdValue}`);
    const settings = await db.user_settings.get(owner);
    const scheduler = createScheduler({
      desiredRetention: settings?.desired_retention,
      weights: weightsOf(settings),
    });
    const reviewed = applyReview(scheduler, card, {
      rating: input.rating,
      mode: input.mode,
      reviewedAt: input.reviewedAt ?? new Date(),
      logId: randomId(),
      responseMs: input.responseMs ?? null,
    });
    const updated = { ...reviewed.card, updated_at: new Date().toISOString() };
    await db.cards.put(updated);
    await db.review_logs.add(reviewed.log);
    await queue(db, "cards", card.id, owner);
    await queue(db, "review_logs", reviewed.log.id, owner);
    return { card: updated, log: reviewed.log };
  });
  notifyWrite();
  return result;
}

export function weightsOf(settings: UserSettingsRow | undefined): number[] | null {
  const w = (settings?.fsrs_params as { w?: unknown } | null | undefined)?.w;
  return Array.isArray(w) && w.every((x) => typeof x === "number") ? (w as number[]) : null;
}

/** Các cột cài đặt thu từ onboarding (gửi khi chuyển cài đặt khách lên tài khoản). */
export const ONBOARDING_SETTING_FIELDS = [
  "target_language",
  "cefr_level",
  "goals",
  "daily_new_limit",
  "reminder_time",
  "timezone",
  "ui_locale",
  "onboarded_at",
] as const;

/**
 * Khách đăng nhập: chuyển dữ liệu trong máy sang tài khoản. Tài khoản đã
 * onboarding thì bỏ cài đặt của khách (không ghi đè), từ và lịch ôn thì gộp.
 */
export async function adoptGuestData(
  db: LocalDb,
  owner: string,
  { keepSettings }: { keepSettings: boolean },
): Promise<{ moved: boolean; onboarded: boolean }> {
  const result = await db.transaction("rw", personalTables(db), async () => {
    const guest = {
      settings: (await db.user_settings.get(GUEST_OWNER)) ?? null,
      notebooks: await db.notebooks.where("user_id").equals(GUEST_OWNER).toArray(),
      userWords: await db.user_words.where("user_id").equals(GUEST_OWNER).toArray(),
      entries: await db.notebook_entries.where("user_id").equals(GUEST_OWNER).toArray(),
      cards: await db.cards.where("user_id").equals(GUEST_OWNER).toArray(),
      logs: await db.review_logs.where("user_id").equals(GUEST_OWNER).toArray(),
    };
    const hasData = guest.settings !== null || guest.userWords.length > 0;
    const guestOnboarded = !!guest.settings?.onboarded_at;
    if (!hasData) return { moved: false, onboarded: false };

    const moved = rekeyOwnedData(guest, GUEST_OWNER, owner, { keepSettings });

    await db.user_settings.delete(GUEST_OWNER);
    await db.notebooks.bulkDelete(guest.notebooks.map((r) => r.id));
    await db.user_words.bulkDelete(guest.userWords.map((r) => r.id));
    await db.notebook_entries.bulkDelete(guest.entries.map((r) => r.id));
    await db.cards.bulkDelete(guest.cards.map((r) => r.id));
    await db.review_logs.bulkDelete(guest.logs.map((r) => r.id));
    await db.outbox.where("owner").equals(GUEST_OWNER).delete();

    if (moved.settings) {
      const current = (await db.user_settings.get(owner)) ?? defaultSettingsRow(owner);
      const patch = Object.fromEntries(
        ONBOARDING_SETTING_FIELDS.map((field) => [field, moved.settings![field]]),
      );
      await db.user_settings.put({ ...current, ...patch });
      await queue(db, "user_settings", owner, owner, [...ONBOARDING_SETTING_FIELDS]);
    }
    // Sổ tay, từ, mục trong sổ: tài khoản đã có thì giữ bản của tài khoản.
    for (const [table, rows] of [
      ["notebooks", moved.notebooks],
      ["user_words", moved.userWords],
      ["notebook_entries", moved.entries],
    ] as const) {
      const store = db.table(table);
      for (const row of rows) {
        if (await store.get(row.id)) continue;
        await store.put(row);
        await queue(db, table, row.id, owner);
      }
    }
    for (const log of moved.logs) {
      await db.review_logs.put(log);
      await queue(db, "review_logs", log.id, owner);
    }
    // Thẻ trùng với thẻ của tài khoản: gộp như khi đồng bộ (tính lại từ lịch sử ôn nếu lệch).
    const settings = await db.user_settings.get(owner);
    const scheduler = createScheduler({
      desiredRetention: settings?.desired_retention,
      weights: weightsOf(settings),
    });
    for (const card of moved.cards) {
      const existing = await db.cards.get(card.id);
      if (!existing) {
        await db.cards.put(card);
        await queue(db, "cards", card.id, owner);
        continue;
      }
      const logs = await db.review_logs.where("card_id").equals(card.id).toArray();
      const merged = mergeCard(card, existing, true, logs, scheduler);
      await db.cards.put(merged.row);
      if (merged.needsPush) await queue(db, "cards", card.id, owner);
    }
    return { moved: true, onboarded: keepSettings && guestOnboarded };
  });
  notifyWrite();
  return result;
}
