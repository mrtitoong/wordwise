import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moreChoices } from "./session-content";

const { from, query } = vi.hoisted(() => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    retry: vi.fn(() => query),
    abortSignal: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "w2",
            lemma: "山",
            pos: "noun",
            word_senses: [{ id: "s2", meaning_vi: "núi", sense_order: 0 }],
          },
        ],
      }),
    ),
  };
  return { query, from: vi.fn(() => query) };
});

vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => ({ url: "x", key: "y" }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from }) }));

const local = [
  { senseId: "s1", wordId: "w1", lemma: "人", pos: "noun" as const, meaning: "người" },
];

describe("moreChoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mất mạng thì dùng đáp án trong máy, không gọi mạng", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(moreChoices(local, "zh")).resolves.toBe(local);
    expect(from).not.toHaveBeenCalled();
  });

  it("có mạng thì lấy thêm một lần, có giới hạn thời gian", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const pool = await moreChoices(local, "zh");
    expect(pool.map((choice) => choice.lemma)).toEqual(["人", "山"]);
    expect(query.retry).toHaveBeenCalledWith(false);
    expect(query.abortSignal).toHaveBeenCalledOnce();
  });
});
