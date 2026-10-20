import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";
import { GUEST_OWNER, cardId, defaultNotebookId, notebookEntryId, userWordId } from "@/lib/db/ids";
import type { CardRow, OutboxItem, ReviewLogRow } from "@/lib/db/types";
import { applyReview, createScheduler, newCardFields, replayCard } from "@/lib/srs/scheduler";
import { mergeCard, mergeRow } from "./merge";
import { PUSH_BATCH_SIZE, planPush } from "./push-plan";
import { rekeyOwnedData } from "./rekey";

const USER = "11111111-1111-4111-8111-111111111111";
const SENSE = "60db4402-ca9b-4997-baa8-ddd85db1b21d";
const scheduler = createScheduler();

function newCard(owner = USER): CardRow {
  const uw = userWordId(owner, SENSE);
  const now = new Date("2026-10-20T00:00:00Z");
  return {
    id: cardId(uw, "meaning"),
    user_id: owner,
    user_word_id: uw,
    skill: "meaning",
    ...newCardFields(now),
    deleted_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

/** Ôn liên tiếp các mức đánh giá, trả về thẻ sau cùng và toàn bộ log. */
function review(card: CardRow, steps: Array<[string, Rating]>, idPrefix: string) {
  const logs: ReviewLogRow[] = [];
  let current = card;
  steps.forEach(([at, rating], i) => {
    const result = applyReview(scheduler, current, {
      rating: rating as 1 | 2 | 3 | 4,
      mode: "flashcard",
      reviewedAt: new Date(at),
      logId: `${idPrefix}-${i}`,
    });
    current = result.card;
    logs.push(result.log);
  });
  return { card: current, logs };
}

describe("ID cố định", () => {
  it("hai máy cùng thêm một từ tạo cùng ID", () => {
    expect(userWordId(USER, SENSE)).toBe(userWordId(USER, SENSE));
    expect(userWordId(USER, SENSE)).not.toBe(userWordId(GUEST_OWNER, SENSE));
    expect(cardId("x", "meaning")).not.toBe(cardId("x", "spelling"));
  });
});

describe("scheduler", () => {
  it("tính lại từ lịch sử ôn ra đúng trạng thái như khi ôn trực tiếp", () => {
    const { card, logs } = review(
      newCard(),
      [
        ["2026-10-20T08:00:00Z", Rating.Good],
        ["2026-10-20T08:10:00Z", Rating.Good],
        ["2026-10-23T08:00:00Z", Rating.Hard],
      ],
      "a",
    );
    expect(card.reps).toBe(3);
    const replayed = replayCard(scheduler, logs);
    expect(replayed).toMatchObject({
      reps: card.reps,
      state: card.state,
      due: card.due,
      last_review: card.last_review,
    });
    expect(replayed.stability).toBeCloseTo(card.stability, 10);
  });

  it("log ghi trạng thái TRƯỚC lượt ôn", () => {
    const { logs } = review(newCard(), [["2026-10-20T08:00:00Z", Rating.Good]], "b");
    expect(logs[0]).toMatchObject({ state: 0, rating: 3, card_id: newCard().id });
  });
});

describe("mergeRow", () => {
  it("không có thay đổi chờ gửi thì lấy bản server", () => {
    expect(mergeRow({ v: 1 }, { v: 2 }, false)).toEqual({ action: "put", row: { v: 2 } });
    expect(mergeRow(undefined, { v: 2 }, true)).toEqual({ action: "put", row: { v: 2 } });
  });

  it("đang chờ gửi thì giữ bản trong máy", () => {
    expect(mergeRow({ v: 1 }, { v: 2 }, true)).toEqual({ action: "keep" });
  });
});

describe("mergeCard", () => {
  const base = newCard();

  it("lấy bản có lần ôn mới nhất khi khớp lịch sử", () => {
    const older = review(base, [["2026-10-20T08:00:00Z", Rating.Good]], "o");
    const newer = review(older.card, [["2026-10-21T08:00:00Z", Rating.Good]], "n");
    const logs = [...older.logs, ...newer.logs];

    // Server mới hơn máy (máy không chờ gửi gì).
    expect(mergeCard(older.card, newer.card, false, logs, scheduler)).toEqual({
      row: newer.card,
      needsPush: false,
    });
    // Máy mới hơn và đang chờ gửi: giữ bản máy, gửi lên.
    expect(mergeCard(newer.card, older.card, true, logs, scheduler)).toEqual({
      row: newer.card,
      needsPush: true,
    });
  });

  it("hai máy cùng ôn khi offline: tính lại từ toàn bộ lịch sử", () => {
    const phoneReview = review(base, [["2026-10-20T08:00:00Z", Rating.Again]], "phone");
    const laptopReview = review(base, [["2026-10-20T09:00:00Z", Rating.Good]], "laptop");
    const allLogs = [...phoneReview.logs, ...laptopReview.logs];

    const merged = mergeCard(phoneReview.card, laptopReview.card, true, allLogs, scheduler);
    expect(merged.needsPush).toBe(true);
    expect(merged.row.reps).toBe(2);
    expect(merged.row.last_review).toBe("2026-10-20T09:00:00.000Z");
    expect(merged.row).toMatchObject(replayCard(scheduler, allLogs));
    // Kết quả như nhau dù gộp theo chiều nào.
    const reverse = mergeCard(laptopReview.card, phoneReview.card, true, allLogs, scheduler);
    expect(reverse.row).toEqual(merged.row);
  });

  it("chưa kéo đủ log thì tin bản mới nhất, không tính lại", () => {
    const done = review(base, [["2026-10-20T08:00:00Z", Rating.Good]], "x");
    expect(mergeCard(undefined, done.card, false, [], scheduler)).toEqual({
      row: done.card,
      needsPush: false,
    });
  });

  it("lượt ôn thêm (is_extra) không tính vào lịch", () => {
    const done = review(base, [["2026-10-20T08:00:00Z", Rating.Good]], "e");
    const extra = { ...done.logs[0]!, id: "extra", is_extra: true };
    expect(mergeCard(undefined, done.card, false, [...done.logs, extra], scheduler).needsPush).toBe(
      false,
    );
  });

  it("giữ cờ xóa của máy khi server chưa biết", () => {
    const deleted = { ...base, deleted_at: "2026-10-22T00:00:00Z" };
    const merged = mergeCard(deleted, base, true, [], scheduler);
    expect(merged.row.deleted_at).toBe("2026-10-22T00:00:00Z");
    expect(merged.needsPush).toBe(true);
  });
});

describe("planPush", () => {
  const item = (
    seq: number,
    table: OutboxItem["table"],
    rowId: string,
    extra = {},
  ): OutboxItem => ({
    seq,
    table,
    rowId,
    owner: USER,
    queuedAt: "2026-10-20T00:00:00Z",
    attempts: 0,
    lastError: null,
    ...extra,
  });

  it("theo thứ tự bảng cha → con, mỗi dòng một lần", () => {
    const batches = planPush(
      [
        item(1, "review_logs", "log1"),
        item(2, "cards", "c1"),
        item(3, "user_words", "uw1"),
        item(4, "cards", "c1"),
        item(5, "notebooks", "nb1"),
      ],
      USER,
    );
    expect(batches.map((b) => b.table)).toEqual([
      "notebooks",
      "user_words",
      "cards",
      "review_logs",
    ]);
    expect(batches[2]).toMatchObject({ rowIds: ["c1"], seqs: [2, 4] });
  });

  it("chia lô 50 dòng", () => {
    const items = Array.from({ length: 120 }, (_, i) => item(i + 1, "review_logs", `log${i}`));
    const batches = planPush(items, USER);
    expect(batches.map((b) => b.rowIds.length)).toEqual([PUSH_BATCH_SIZE, PUSH_BATCH_SIZE, 20]);
  });

  it("gộp cột cài đặt đã đổi; bỏ qua việc của chủ khác và việc bị gác", () => {
    const batches = planPush(
      [
        item(1, "user_settings", USER, { fields: ["daily_new_limit"] }),
        item(2, "user_settings", USER, { fields: ["ui_locale", "daily_new_limit"] }),
        item(3, "cards", "guest-card", { owner: GUEST_OWNER }),
        item(4, "cards", "broken", { attempts: 5 }),
      ],
      USER,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]!.fields[USER]!.sort()).toEqual(["daily_new_limit", "ui_locale"]);
  });
});

describe("rekeyOwnedData", () => {
  it("đổi chủ và tính lại ID cố định theo tài khoản", () => {
    const guestCard = newCard(GUEST_OWNER);
    const { logs } = review(guestCard, [["2026-10-20T08:00:00Z", Rating.Good]], "g");
    const guestNotebook = defaultNotebookId(GUEST_OWNER);
    const moved = rekeyOwnedData(
      {
        settings: null,
        notebooks: [{ id: guestNotebook, user_id: GUEST_OWNER } as never],
        userWords: [{ id: guestCard.user_word_id, user_id: GUEST_OWNER, sense_id: SENSE } as never],
        entries: [
          {
            id: notebookEntryId(guestNotebook, guestCard.user_word_id),
            user_id: GUEST_OWNER,
            notebook_id: guestNotebook,
            user_word_id: guestCard.user_word_id,
          } as never,
        ],
        cards: [guestCard],
        logs,
      },
      GUEST_OWNER,
      USER,
      { keepSettings: false },
    );

    const uw = userWordId(USER, SENSE);
    expect(moved.userWords[0]).toMatchObject({ id: uw, user_id: USER });
    expect(moved.notebooks[0]!.id).toBe(defaultNotebookId(USER));
    expect(moved.entries[0]).toMatchObject({
      id: notebookEntryId(defaultNotebookId(USER), uw),
      notebook_id: defaultNotebookId(USER),
      user_word_id: uw,
    });
    expect(moved.cards[0]).toMatchObject({ id: cardId(uw, "meaning"), user_word_id: uw });
    expect(moved.logs[0]).toMatchObject({ card_id: cardId(uw, "meaning"), user_id: USER });
    expect(moved.settings).toBeNull();
  });
});
