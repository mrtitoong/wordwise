import type { Grade } from "ts-fsrs";
import { missingSkillCards, type Skill } from "@/lib/srs/cards";
import { applyReview, createScheduler, newCardFields } from "@/lib/srs/scheduler";
import { introducedToday, planIntroductions } from "@/lib/notebooks/introductions";
import { mergeCard } from "@/lib/sync/merge";
import { addAddition, parseUserAdditions, serializeAdditions } from "@/lib/words/user-additions";
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
import type {
  CardRow,
  OutboxItem,
  ReviewLogRow,
  SyncTable,
  UserSettingsRow,
  UserWordRow,
} from "./types";

/**
 * Các thao tác ghi dữ liệu cá nhân. Mỗi thao tác ghi bản trong máy và thêm việc
 * vào outbox trong cùng một transaction, rồi báo cho sync engine (onLocalWrite).
 */
let writeListener: (() => void) | null = null;

export function onLocalWrite(listener: (() => void) | null): void {
  writeListener = listener;
}

export function notifyWrite() {
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

export function personalTables(db: LocalDb) {
  return SYNC_STORES.map((name) => db.table(name));
}

export async function queue(
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
    multi_accent: false,
    daily_new_limit: 10,
    daily_review_limit: 200,
    desired_retention: 0.9,
    fsrs_params: null,
    reminder_time: null,
    timezone: "Asia/Ho_Chi_Minh",
    accent: "us",
    onboarded_at: null,
    practice_speaking: false,
    practice_spelling: true,
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

export type InputMethod = "typed" | "voice" | "photo" | "csv" | "list";

export type AddEntry = {
  senseId: string;
  contextSentence?: string | null;
  /** Ảnh gốc nơi gặp từ (storage://user-images/…), khi người dùng chọn giữ ảnh chụp. */
  contextImageUrl?: string | null;
  tags?: string[];
  /** Ghi chú riêng → "Ghi chú của bạn" ở tab Nghĩa (không thêm trùng). */
  note?: string | null;
};

export type AddOptions = {
  notebookId: string;
  inputMethod: InputMethod;
  source?: string | null;
};

export type AddResult = {
  /** Nghĩa mới vào kho. */
  added: string[];
  /** Nghĩa đã có trong kho, chỉ gắn thêm vào sổ này. */
  linked: string[];
  /** Đã có trong sổ này, bỏ qua. */
  skipped: string[];
};

/** Tạo "Sổ của tôi" nếu chưa có (trong transaction đang chạy). */
async function ensureDefaultNotebook(db: LocalDb, owner: string, name: string, iso: string) {
  const notebookId = defaultNotebookId(owner);
  if (!(await db.notebooks.get(notebookId))) {
    await db.notebooks.put({
      id: notebookId,
      user_id: owner,
      name,
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
  return notebookId;
}

/**
 * Thêm các nghĩa vào một sổ, mỗi từ kèm một thẻ ôn "nghĩa". Từ mới vào hàng "Sắp học"
 * (status queued), sau đó mở dần theo số từ mới mỗi ngày (openNewWords). Từ đã có trong kho
 * thì giữ nguyên lịch ôn, chỉ gắn thêm vào sổ.
 */
export async function addSensesToNotebook(
  db: LocalDb,
  owner: string,
  items: readonly AddEntry[],
  options: AddOptions,
  now = new Date(),
): Promise<AddResult> {
  const iso = now.toISOString();
  const result: AddResult = { added: [], linked: [], skipped: [] };
  await db.transaction("rw", personalTables(db), async () => {
    const notebook = await db.notebooks.get(options.notebookId);
    if (!notebook || notebook.user_id !== owner || notebook.deleted_at) {
      throw new Error(`Không có sổ ${options.notebookId}`);
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.senseId)) continue;
      seen.add(item.senseId);
      // Cách nhau 1 ms để giữ đúng thứ tự người dùng nhập (từ trên trước được mở trước).
      const addedAt = new Date(now.getTime() + seen.size - 1).toISOString();
      const uwId = userWordId(owner, item.senseId);
      const existing = await db.user_words.get(uwId);
      const isNew = !existing || !!existing.deleted_at;
      if (isNew) {
        await db.user_words.put({
          id: uwId,
          user_id: owner,
          sense_id: item.senseId,
          custom_meaning: existing?.custom_meaning ?? null,
          custom_note: existing?.custom_note ?? null,
          custom_image_url: existing?.custom_image_url ?? null,
          user_additions: existing?.user_additions ?? {},
          status: "queued",
          introduced_at: null,
          added_at: existing?.added_at ?? addedAt,
          deleted_at: null,
          created_at: existing?.created_at ?? iso,
          updated_at: iso,
        });
        await queue(db, "user_words", uwId, owner);
      }

      const note = item.note?.trim();
      if (note) {
        const row = (await db.user_words.get(uwId))!;
        const additions = parseUserAdditions(row.user_additions);
        if (!additions.meaning.some((n) => n.text === note)) {
          const next = addAddition(additions, "meaning", { text: note }, randomId());
          if (next.ok) {
            await db.user_words.put({
              ...row,
              user_additions: serializeAdditions(next.additions),
              updated_at: iso,
            });
            await queue(db, "user_words", uwId, owner);
          }
        }
      }

      const entryId = notebookEntryId(options.notebookId, uwId);
      const entry = await db.notebook_entries.get(entryId);
      if (entry && !entry.deleted_at) {
        result.skipped.push(item.senseId);
      } else {
        await db.notebook_entries.put({
          id: entryId,
          user_id: owner,
          notebook_id: options.notebookId,
          user_word_id: uwId,
          input_method: options.inputMethod,
          context_sentence: item.contextSentence ?? null,
          context_image_url: item.contextImageUrl ?? null,
          source: options.source ?? null,
          tags: item.tags ?? [],
          added_at: addedAt,
          deleted_at: null,
          created_at: entry?.created_at ?? iso,
          updated_at: iso,
        });
        await queue(db, "notebook_entries", entryId, owner);
        (isNew ? result.added : result.linked).push(item.senseId);
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
    await introduce(db, owner, now);
  });
  notifyWrite();
  return result;
}

/** Id "Sổ của tôi", tạo nếu chưa có (người dùng bỏ qua 5 từ khởi đầu). */
export async function getOrCreateDefaultNotebook(
  db: LocalDb,
  owner: string,
  name: string,
): Promise<string> {
  const notebookId = defaultNotebookId(owner);
  const existing = await db.notebooks.get(notebookId);
  if (existing && !existing.deleted_at) return notebookId;
  await db.transaction("rw", db.notebooks, db.outbox, () =>
    ensureDefaultNotebook(db, owner, name, new Date().toISOString()),
  );
  notifyWrite();
  return notebookId;
}

/** Thêm vào "Sổ của tôi" (tạo nếu chưa có): 5 từ khởi đầu, chip từ liên quan. */
export async function addSensesToDefaultNotebook(
  db: LocalDb,
  owner: string,
  senseIds: readonly string[],
  notebookName: string,
  inputMethod: InputMethod = "list",
  source: string | null = "starter",
): Promise<AddResult> {
  const iso = new Date().toISOString();
  const notebookId = await db.transaction("rw", db.notebooks, db.outbox, () =>
    ensureDefaultNotebook(db, owner, notebookName, iso),
  );
  return addSensesToNotebook(
    db,
    owner,
    senseIds.map((senseId) => ({ senseId })),
    { notebookId, inputMethod, source },
  );
}

/** Mở từ "Sắp học" cho đủ số từ mới hôm nay (trong transaction đang chạy). */
async function introduce(db: LocalDb, owner: string, now: Date): Promise<number> {
  const settings = (await db.user_settings.get(owner)) ?? defaultSettingsRow(owner, now);
  const userWords = await db.user_words.where("user_id").equals(owner).toArray();
  const ids = planIntroductions(userWords, {
    dailyLimit: settings.daily_new_limit,
    now,
    timeZone: settings.timezone,
  });
  const iso = now.toISOString();
  for (const id of ids) {
    const row = userWords.find((uw) => uw.id === id)!;
    await db.user_words.put({ ...row, status: "learning", introduced_at: iso, updated_at: iso });
    await queue(db, "user_words", id, owner);
  }
  return ids.length;
}

/** Mở dần từ "Sắp học" (gọi khi mở app và sau khi đồng bộ). Trả về số từ vừa mở. */
export async function openNewWords(db: LocalDb, owner: string, now = new Date()): Promise<number> {
  const opened = await db.transaction("rw", db.user_words, db.user_settings, db.outbox, () =>
    introduce(db, owner, now),
  );
  if (opened > 0) notifyWrite();
  return opened;
}

/** Kỹ năng có chế độ ôn trong app (GĐ4 thêm Chính tả, GĐ5 thêm Phát âm). */
export const SKILLS_WITH_MODES: readonly Skill[] = ["meaning", "spelling", "speaking"];

/** Tạo thẻ kỹ năng còn thiếu (trong transaction đang chạy); `userWordIds` để chỉ xét vài từ. */
async function createSkillCards(
  db: LocalDb,
  owner: string,
  now: Date,
  userWordIds?: readonly string[],
): Promise<number> {
  const userWords = userWordIds
    ? (await db.user_words.bulkGet([...userWordIds])).filter((u): u is UserWordRow => !!u)
    : await db.user_words.where("user_id").equals(owner).toArray();
  const cards = userWordIds
    ? await db.cards
        .where("user_word_id")
        .anyOf([...userWordIds])
        .toArray()
    : await db.cards.where("user_id").equals(owner).toArray();
  const missing = missingSkillCards(
    userWords.filter((u) => u.user_id === owner),
    cards,
    SKILLS_WITH_MODES,
    now,
  );
  for (const card of missing) {
    await db.cards.put(card);
    await queue(db, "cards", card.id, owner);
  }
  return missing.length;
}

/**
 * Tạo thẻ Chính tả cho từ đã qua bước học mà chưa có (từ học trước GĐ4, thẻ Nghĩa ôn ở máy khác).
 * Gọi khi mở app, sau khi đồng bộ và trước phiên ôn. Trả về số thẻ vừa tạo.
 */
export async function ensureSkillCards(db: LocalDb, owner: string, now = new Date()) {
  const created = await db.transaction("rw", db.user_words, db.cards, db.outbox, () =>
    createSkillCards(db, owner, now),
  );
  if (created > 0) notifyWrite();
  return created;
}

/**
 * "Học thêm N từ mới": người dùng chủ động mở thêm từ ở hàng Sắp học, vượt giới hạn ngày. Thêm vào
 * sổ trước thì mở trước. Trả về id các từ vừa mở.
 */
export async function openExtraWords(
  db: LocalDb,
  owner: string,
  count: number,
  now = new Date(),
): Promise<string[]> {
  const opened = await db.transaction("rw", db.user_words, db.outbox, async () => {
    const queued = (await db.user_words.where("user_id").equals(owner).toArray())
      .filter((uw) => !uw.deleted_at && uw.status === "queued")
      .sort((a, b) => a.added_at.localeCompare(b.added_at) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, count));
    const iso = now.toISOString();
    for (const row of queued) {
      await db.user_words.put({ ...row, status: "learning", introduced_at: iso, updated_at: iso });
      await queue(db, "user_words", row.id, owner);
    }
    return queued.map((row) => row.id);
  });
  if (opened.length > 0) notifyWrite();
  return opened;
}

/** Số chỗ còn lại để mở từ mới hôm nay (cho thanh tóm tắt khi thêm từ). */
export async function openSlotsToday(
  db: LocalDb,
  owner: string,
  now = new Date(),
): Promise<number> {
  const settings = (await db.user_settings.get(owner)) ?? defaultSettingsRow(owner, now);
  const userWords = await db.user_words.where("user_id").equals(owner).toArray();
  return Math.max(0, settings.daily_new_limit - introducedToday(userWords, now, settings.timezone));
}

export type UserWordPatch = Partial<
  Pick<UserWordRow, "custom_meaning" | "custom_image_url" | "user_additions">
>;

/** Sửa nội dung riêng của một từ trong kho (nghĩa/ảnh tự đặt, nội dung "Của bạn"). */
export async function updateUserWord(
  db: LocalDb,
  owner: string,
  userWordIdValue: string,
  patch: UserWordPatch,
): Promise<UserWordRow> {
  const updated = await db.transaction("rw", db.user_words, db.outbox, async () => {
    const current = await db.user_words.get(userWordIdValue);
    if (!current || current.user_id !== owner || current.deleted_at) {
      throw new Error(`Không có từ ${userWordIdValue}`);
    }
    const row = { ...current, ...patch, updated_at: new Date().toISOString() };
    await db.user_words.put(row);
    await queue(db, "user_words", row.id, owner);
    return row;
  });
  notifyWrite();
  return updated;
}

/** Ghi một lượt ôn: cập nhật thẻ và thêm review_logs (chỉ thêm), cùng một transaction. */
export async function recordReview(
  db: LocalDb,
  owner: string,
  cardIdValue: string,
  input: {
    rating: Grade;
    mode: ReviewLogRow["mode"];
    reviewedAt?: Date;
    responseMs?: number;
    correct?: boolean;
    hintLevel?: number;
    pronunciationScore?: number;
    extra?: boolean;
  },
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
      correct: input.correct ?? null,
      hintLevel: input.hintLevel ?? 0,
      pronunciationScore: input.pronunciationScore ?? null,
      extra: input.extra ?? false,
    });
    await db.review_logs.add(reviewed.log);
    await queue(db, "review_logs", reviewed.log.id, owner);
    // Lượt ôn ngoài lịch mà nhớ được: thẻ giữ nguyên, không cần gửi lại.
    if (reviewed.log.is_extra) return { card, log: reviewed.log };
    const updated = { ...reviewed.card, updated_at: new Date().toISOString() };
    await db.cards.put(updated);
    await queue(db, "cards", card.id, owner);
    // Thẻ Nghĩa vừa qua bước học → mở thẻ Chính tả (ôn từ phiên sau).
    if (card.skill === "meaning") {
      await createSkillCards(db, owner, new Date(reviewed.log.reviewed_at), [card.user_word_id]);
    }
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
