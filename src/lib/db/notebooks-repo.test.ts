import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardId, defaultNotebookId, userWordId } from "./ids";
import { LocalDb } from "./local";
import {
  copyEntries,
  createNotebook,
  deleteNotebook,
  removeEntries,
  restoreSnapshot,
  setSuspended,
  updateNotebook,
} from "./notebooks-repo";
import {
  addSensesToDefaultNotebook,
  addSensesToNotebook,
  openNewWords,
  saveSettings,
} from "./repo";

const USER = "11111111-1111-4111-8111-111111111111";
const S1 = "60db4402-ca9b-4997-baa8-ddd85db1b21d";
const S2 = "a13fc340-7924-407d-818f-fb4c52573c3c";
const S3 = "b13fc340-7924-407d-818f-fb4c52573c3c";

let db: LocalDb;

beforeEach(async () => {
  db = new LocalDb(`nb-test-${Math.random()}`);
  await saveSettings(db, USER, { daily_new_limit: 2, timezone: "Asia/Ho_Chi_Minh" });
});

afterEach(async () => {
  await db.delete();
});

const live = <T extends { deleted_at: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at);

describe("thêm từ vào sổ", () => {
  it("từ mới vào Sắp học rồi mở dần theo số từ mới mỗi ngày", async () => {
    const book = await createNotebook(db, USER, { name: "IELTS" });
    const result = await addSensesToNotebook(
      db,
      USER,
      [
        { senseId: S1, contextSentence: "Câu gốc" },
        { senseId: S2 },
        { senseId: S3, tags: ["env"] },
      ],
      { notebookId: book.id, inputMethod: "typed" },
    );
    expect(result.added).toEqual([S1, S2, S3]);
    const words = await db.user_words.toArray();
    expect(
      words
        .filter((w) => w.status === "learning")
        .map((w) => w.sense_id)
        .sort(),
    ).toEqual([S1, S2].sort());
    expect(words.find((w) => w.sense_id === S3)!.status).toBe("queued");
    const entries = await db.notebook_entries.toArray();
    expect(entries.find((e) => e.user_word_id === userWordId(USER, S1))!.context_sentence).toBe(
      "Câu gốc",
    );
    expect(entries.find((e) => e.user_word_id === userWordId(USER, S3))!.tags).toEqual(["env"]);
    expect(await db.cards.count()).toBe(3);
    // Hôm nay đã đủ 2 từ: mở thêm không được.
    expect(await openNewWords(db, USER)).toBe(0);
    // Ngày mai mở tiếp.
    expect(await openNewWords(db, USER, new Date(Date.now() + 86_400_000))).toBe(1);
  });

  it("từ đã có trong kho: gắn thêm vào sổ, giữ lịch ôn; trùng trong sổ thì bỏ qua", async () => {
    await addSensesToDefaultNotebook(db, USER, [S1], "Sổ của tôi");
    const book = await createNotebook(db, USER, { name: "Đọc sách" });
    await db.cards.update(cardId(userWordId(USER, S1), "meaning"), { reps: 5 });
    const result = await addSensesToNotebook(db, USER, [{ senseId: S1 }, { senseId: S1 }], {
      notebookId: book.id,
      inputMethod: "typed",
    });
    expect(result).toEqual({ added: [], linked: [S1], skipped: [] });
    expect((await db.cards.get(cardId(userWordId(USER, S1), "meaning")))!.reps).toBe(5);
    const again = await addSensesToNotebook(db, USER, [{ senseId: S1 }], {
      notebookId: book.id,
      inputMethod: "typed",
    });
    expect(again.skipped).toEqual([S1]);
  });
});

describe("ghi chú riêng khi nhập file", () => {
  it("thêm vào tab Nghĩa, không trùng khi nhập lại", async () => {
    const book = await createNotebook(db, USER, { name: "File" });
    const add = () =>
      addSensesToNotebook(
        db,
        USER,
        [{ senseId: S1, note: "kiên cường · sách Grit", tags: ["ielts"] }],
        {
          notebookId: book.id,
          inputMethod: "csv",
        },
      );
    await add();
    await add();
    const row = (await db.user_words.get(userWordId(USER, S1)))!;
    expect(row.user_additions).toEqual({
      meaning: [{ id: expect.any(String), text: "kiên cường · sách Grit" }],
    });
  });
});

describe("sổ tay", () => {
  it("sửa, lưu trữ; không xóa được sổ mặc định", async () => {
    const book = await createNotebook(db, USER, { name: " Phim ", tags: ["Netflix", "netflix"] });
    expect(book.name).toBe("Phim");
    expect(book.tags).toEqual(["netflix"]);
    const updated = await updateNotebook(db, USER, book.id, {
      description: "Từ trong phim",
      is_archived: true,
    });
    expect(updated).toMatchObject({
      name: "Phim",
      description: "Từ trong phim",
      is_archived: true,
    });
    await addSensesToDefaultNotebook(db, USER, [S1], "Sổ của tôi");
    await expect(deleteNotebook(db, USER, defaultNotebookId(USER))).rejects.toThrow();
  });

  it("xóa từ khỏi sổ: còn ở sổ khác thì giữ lịch ôn, sổ cuối thì xóa; hoàn tác được", async () => {
    await addSensesToDefaultNotebook(db, USER, [S1], "Sổ của tôi");
    const book = await createNotebook(db, USER, { name: "IELTS" });
    await addSensesToNotebook(db, USER, [{ senseId: S1 }, { senseId: S2 }], {
      notebookId: book.id,
      inputMethod: "typed",
    });
    const inBook = live(await db.notebook_entries.where("notebook_id").equals(book.id).toArray());
    const snapshot = await removeEntries(
      db,
      USER,
      inBook.map((e) => e.id),
    );

    expect((await db.user_words.get(userWordId(USER, S1)))!.deleted_at).toBeNull();
    expect((await db.user_words.get(userWordId(USER, S2)))!.deleted_at).not.toBeNull();
    expect(
      (await db.cards.get(cardId(userWordId(USER, S2), "meaning")))!.deleted_at,
    ).not.toBeNull();

    await restoreSnapshot(db, USER, snapshot);
    expect(
      live(await db.notebook_entries.where("notebook_id").equals(book.id).toArray()),
    ).toHaveLength(2);
    expect((await db.cards.get(cardId(userWordId(USER, S2), "meaning")))!.deleted_at).toBeNull();
  });

  it("xóa sổ xóa luôn từ chỉ có ở sổ đó; hoàn tác trả lại sổ", async () => {
    const book = await createNotebook(db, USER, { name: "Tạm" });
    await addSensesToNotebook(db, USER, [{ senseId: S1 }], {
      notebookId: book.id,
      inputMethod: "typed",
    });
    const snapshot = await deleteNotebook(db, USER, book.id);
    expect((await db.notebooks.get(book.id))!.deleted_at).not.toBeNull();
    expect(live(await db.user_words.toArray())).toHaveLength(0);
    await restoreSnapshot(db, USER, snapshot);
    expect((await db.notebooks.get(book.id))!.deleted_at).toBeNull();
    expect(live(await db.user_words.toArray())).toHaveLength(1);
  });

  it("chuyển và sao chép giữ lịch ôn", async () => {
    const a = await createNotebook(db, USER, { name: "A" });
    const b = await createNotebook(db, USER, { name: "B" });
    await addSensesToNotebook(db, USER, [{ senseId: S1, contextSentence: "câu" }], {
      notebookId: a.id,
      inputMethod: "photo",
    });
    const [entry] = live(await db.notebook_entries.where("notebook_id").equals(a.id).toArray());

    const copy = await copyEntries(db, USER, [entry!.id], b.id, { move: false });
    expect(copy.copied).toBe(1);
    const inB = live(await db.notebook_entries.where("notebook_id").equals(b.id).toArray());
    expect(inB[0]).toMatchObject({ input_method: "photo", context_sentence: "câu" });
    expect(
      live(await db.notebook_entries.where("notebook_id").equals(a.id).toArray()),
    ).toHaveLength(1);

    await removeEntries(
      db,
      USER,
      inB.map((e) => e.id),
    );
    const move = await copyEntries(db, USER, [entry!.id], b.id, { move: true });
    expect(move.copied).toBe(1);
    expect(
      live(await db.notebook_entries.where("notebook_id").equals(a.id).toArray()),
    ).toHaveLength(0);
    expect((await db.user_words.get(userWordId(USER, S1)))!.deleted_at).toBeNull();
  });

  it("tạm ngưng và bỏ tạm ngưng", async () => {
    await addSensesToDefaultNotebook(db, USER, [S1, S2, S3], "Sổ của tôi");
    const ids = [S1, S3].map((s) => userWordId(USER, s));
    await setSuspended(db, USER, ids, true);
    expect((await db.user_words.get(ids[0]!))!.status).toBe("suspended");
    await setSuspended(db, USER, ids, false);
    expect((await db.user_words.get(ids[0]!))!.status).toBe("learning");
    expect((await db.user_words.get(ids[1]!))!.status).toBe("queued");
  });
});
