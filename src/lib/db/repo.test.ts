import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userWordId } from "./ids";
import { LocalDb } from "./local";
import { addSensesToDefaultNotebook, updateUserWord } from "./repo";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SENSE = "60db4402-ca9b-4997-baa8-ddd85db1b21d";

let db: LocalDb;

beforeEach(async () => {
  db = new LocalDb(`repo-test-${Math.random()}`);
  await addSensesToDefaultNotebook(db, USER, [SENSE], "Sổ của tôi", "typed", "word_card");
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

describe("updateUserWord", () => {
  it("ghi vào máy và xếp việc đồng bộ trong cùng thao tác", async () => {
    const id = userWordId(USER, SENSE);
    const before = (await db.user_words.get(id))!;
    await new Promise((r) => setTimeout(r, 5));
    const row = await updateUserWord(db, USER, id, {
      custom_meaning: "nhà băng",
      user_additions: { memory: [{ id: "1", text: "mẹo" }] },
    });
    expect(row.custom_meaning).toBe("nhà băng");
    expect(row.updated_at > before.updated_at).toBe(true);
    expect((await db.user_words.get(id))!.user_additions).toEqual({
      memory: [{ id: "1", text: "mẹo" }],
    });
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "user_words", rowId: id, owner: USER });
  });

  it("không sửa được từ của người khác hoặc từ đã xóa", async () => {
    const id = userWordId(USER, SENSE);
    await expect(updateUserWord(db, OTHER, id, { custom_meaning: "x" })).rejects.toThrow();
    await db.user_words.update(id, { deleted_at: new Date().toISOString() });
    await expect(updateUserWord(db, USER, id, { custom_meaning: "x" })).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
  });
});
