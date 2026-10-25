import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardId, userWordId } from "./ids";
import { acceptListUpdate, addListToNotebook, setTargetDate, skipListUpdate } from "./library-repo";
import { LocalDb } from "./local";
import { createNotebook } from "./notebooks-repo";
import { addSensesToNotebook, openNewWords, recordReview, saveSettings } from "./repo";

const USER = "11111111-1111-4111-8111-111111111111";
const LIST = "22222222-2222-4222-8222-222222222222";
const sense = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const items = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    senseId: sense(from + i),
    subtopic: i % 2 === 0 ? "Climate" : null,
    contextSentence: from + i === 1 ? "Câu trong bài đọc." : null,
  }));

const NOW = new Date("2026-11-01T05:00:00Z");
let db: LocalDb;

beforeEach(async () => {
  db = new LocalDb(`library-test-${Math.random()}`);
  await saveSettings(db, USER, { daily_new_limit: 2, timezone: "Asia/Ho_Chi_Minh" });
});

afterEach(async () => {
  await db.delete();
});

const opened = async () =>
  (await db.user_words.where("user_id").equals(USER).toArray())
    .filter((uw) => uw.status === "learning")
    .map((uw) => uw.sense_id)
    .sort();

describe("addListToNotebook", () => {
  it("tạo sổ mới gắn danh sách, phiên bản, ngày mục tiêu; giữ thứ tự, tag, câu gốc", async () => {
    const { notebook, result } = await addListToNotebook(
      db,
      USER,
      {
        listId: LIST,
        version: 2,
        target: { kind: "new", name: "IELTS Environment", coverUrl: null },
        targetDate: "2026-11-25", // 10 ngày học từ mới
        items: items(1, 30),
      },
      NOW,
    );
    expect(notebook).toMatchObject({
      name: "IELTS Environment",
      source_list_id: LIST,
      source_list_version: 2,
      target_date: "2026-11-25",
    });
    expect(result.added).toHaveLength(30);

    const entries = await db.notebook_entries.where("notebook_id").equals(notebook.id).toArray();
    const first = entries.find((e) => e.user_word_id === userWordId(USER, sense(1)))!;
    expect(first).toMatchObject({
      input_method: "list",
      source: `list:${LIST}`,
      tags: ["Climate"],
      context_sentence: "Câu trong bài đọc.",
    });
    // 30 từ / 10 ngày = 3 từ hôm nay theo lộ trình (theo thứ tự danh sách), ngoài 2 từ chung.
    expect(await opened()).toEqual([sense(1), sense(2), sense(3)]);
    const outbox = await db.outbox
      .where("[table+rowId]")
      .equals(["notebooks", notebook.id])
      .count();
    expect(outbox).toBeGreaterThan(0);
  });

  it("dùng sổ có sẵn; từ đang học ở sổ khác giữ lịch ôn", async () => {
    const mine = await createNotebook(db, USER, { name: "Của tôi" });
    await addSensesToNotebook(db, USER, [{ senseId: sense(1) }], {
      notebookId: mine.id,
      inputMethod: "typed",
    });
    const before = await db.cards.get(cardId(userWordId(USER, sense(1)), "meaning"));
    const target = await createNotebook(db, USER, { name: "Ôn thi" });
    const { notebook, result } = await addListToNotebook(db, USER, {
      listId: LIST,
      version: 1,
      target: { kind: "existing", notebookId: target.id },
      targetDate: null,
      items: items(1, 3),
    });
    expect(notebook.id).toBe(target.id);
    expect(notebook.source_list_id).toBe(LIST);
    expect(result.linked).toEqual([sense(1)]);
    expect(result.added).toEqual([sense(2), sense(3)]);
    expect(await db.cards.get(cardId(userWordId(USER, sense(1)), "meaning"))).toEqual(before);
  });

  it("lỗi thì không còn sổ rỗng", async () => {
    await expect(
      addListToNotebook(db, USER, {
        listId: LIST,
        version: 1,
        target: { kind: "new", name: "  ", coverUrl: null },
        targetDate: null,
        items: items(1, 2),
      }),
    ).rejects.toThrow();
    expect(await db.notebooks.count()).toBe(0);
  });
});

describe("bản cập nhật của danh sách", () => {
  async function seed() {
    const { notebook } = await addListToNotebook(db, USER, {
      listId: LIST,
      version: 1,
      target: { kind: "new", name: "TOEIC", coverUrl: null },
      targetDate: null,
      items: items(1, 2),
    });
    return notebook;
  }

  it("Nhận: thêm từ mới vào sổ và ghi phiên bản", async () => {
    const notebook = await seed();
    const result = await acceptListUpdate(db, USER, notebook.id, 3, items(3, 4));
    expect(result.added).toEqual([sense(3), sense(4)]);
    expect((await db.notebooks.get(notebook.id))!.source_list_version).toBe(3);
  });

  it("Bỏ qua: chỉ ghi phiên bản", async () => {
    const notebook = await seed();
    await skipListUpdate(db, USER, notebook.id, 2);
    expect((await db.notebooks.get(notebook.id))!.source_list_version).toBe(2);
    expect(await db.notebook_entries.where("notebook_id").equals(notebook.id).count()).toBe(2);
  });

  it("sổ không theo danh sách thì báo lỗi", async () => {
    const plain = await createNotebook(db, USER, { name: "Thường" });
    await expect(skipListUpdate(db, USER, plain.id, 2)).rejects.toThrow();
  });
});

describe("setTargetDate", () => {
  it("đặt ngày mục tiêu cho sổ có sẵn rồi mở từ theo lộ trình", async () => {
    await saveSettings(db, USER, { daily_new_limit: 0 });
    const book = await createNotebook(db, USER, { name: "Thi" });
    await addSensesToNotebook(
      db,
      USER,
      items(1, 20).map((i) => ({ senseId: i.senseId })),
      { notebookId: book.id, inputMethod: "typed" },
      NOW,
    );
    expect(await opened()).toEqual([]);
    await setTargetDate(db, USER, book.id, "2026-11-25");
    await openNewWords(db, USER, NOW);
    expect(await opened()).toEqual([sense(1), sense(2)]);
    await setTargetDate(db, USER, book.id, null);
    expect((await db.notebooks.get(book.id))!.target_date).toBeNull();
    await expect(setTargetDate(db, USER, book.id, "25/11/2026")).rejects.toThrow();
  });
});

describe("tỉ lệ nhớ 14 ngày cuối", () => {
  it("thẻ của từ trong sổ ở 14 ngày cuối được xếp lịch với tỉ lệ nhớ 0,95", async () => {
    const reviewAt = new Date("2026-11-20T05:00:00Z");
    const setup = async (targetDate: string | null) => {
      const local = new LocalDb(`library-retention-${Math.random()}`);
      await saveSettings(local, USER, { daily_new_limit: 5, timezone: "Asia/Ho_Chi_Minh" });
      await addListToNotebook(
        local,
        USER,
        {
          listId: LIST,
          version: 1,
          target: { kind: "new", name: "Thi", coverUrl: null },
          targetDate,
          items: items(1, 1),
        },
        new Date("2026-11-01T05:00:00Z"),
      );
      const id = cardId(userWordId(USER, sense(1)), "meaning");
      // Thẻ đã ở trạng thái Ôn (S = 20 ngày), đến hạn hôm nay.
      const current = (await local.cards.get(id))!;
      await local.cards.put({
        ...current,
        state: 2,
        stability: 20,
        difficulty: 5,
        reps: 3,
        scheduled_days: 20,
        last_review: "2026-10-31T05:00:00.000Z",
        due: reviewAt.toISOString(),
      });
      const { card } = await recordReview(local, USER, id, {
        rating: 3,
        mode: "flashcard",
        reviewedAt: reviewAt,
      });
      await local.delete();
      return card.scheduled_days;
    };
    // Ngày mục tiêu 2026-11-30: 2026-11-20 nằm trong 14 ngày cuối → khoảng ôn ngắn hơn hẳn.
    const final = await setup("2026-11-30");
    const normal = await setup(null);
    expect(final).toBeLessThan(normal * 0.75);
  });
});
