import { describe, expect, it, vi } from "vitest";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { ResolveResponseSchema, WordResponseSchema } from "@/lib/words/api";
import type { WordStore, WorkerDeps } from "@/lib/words/pipeline";
import { createHandler, type HandlerDeps } from "./handler";

function emptyStore(): WordStore {
  return {
    findWords: vi.fn(async () => []),
    findWordId: vi.fn(async () => null),
    requestJob: vi.fn(async () => ({
      limitReached: false as const,
      jobId: "job-1",
      dailyLimit: 50,
    })),
    claimJobs: vi.fn(async () => []),
    saveWord: vi.fn(async () => "w"),
    completeJob: vi.fn(async () => {}),
    failJob: vi.fn(async () => {}),
  };
}

function setup(overrides: Partial<HandlerDeps> = {}) {
  const store = emptyStore();
  const waitUntil = vi.fn();
  const worker = { store } as unknown as WorkerDeps;
  const deps: HandlerDeps = {
    pipeline: { store, lemmatizer: englishLemmatizer },
    worker,
    getUserId: vi.fn(async (authorization) => (authorization === "Bearer user-jwt" ? "u1" : null)),
    verifyWorkerSecret: vi.fn(async (secret) => secret === "s".repeat(64)),
    waitUntil,
    ...overrides,
  };
  return { handle: createHandler(deps), store, waitUntil, deps };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/generate-word", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("generate-word handler", () => {
  it("CORS preflight", async () => {
    const { handle } = setup();
    const response = await handle(new Request("http://localhost", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("chỉ nhận POST và JSON hợp lệ", async () => {
    const { handle } = setup();
    expect((await handle(new Request("http://localhost"))).status).toBe(405);
    expect((await handle(post("{"))).status).toBe(400);
    expect((await handle(post({ lemma: "" }))).status).toBe(400);
    expect((await handle(post({ lemma: "x".repeat(65) }))).status).toBe(400);
  });

  it("khách xin từ ngoài kho → login_required", async () => {
    const { handle, store } = setup();
    const response = await handle(post({ lemma: "zygote" }));
    const body = WordResponseSchema.parse(await response.json());
    expect(body.status).toBe("login_required");
    expect(store.requestJob).not.toHaveBeenCalled();
  });

  it("người dùng xin từ mới → preparing và xử lý ngay trong nền", async () => {
    const { handle, store, waitUntil } = setup();
    const response = await handle(
      post({ lemma: "Zygotes", pos: "noun" }, { authorization: "Bearer user-jwt" }),
    );
    const body = WordResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ status: "preparing", jobId: "job-1", lemma: "zygote" });
    expect(store.requestJob).toHaveBeenCalledWith("u1", "en", "zygote", "noun");
    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it("chưa có khóa LLM → vẫn xếp việc, không chạy worker", async () => {
    const { handle, waitUntil } = setup({ worker: null });
    const response = await handle(post({ lemma: "zygote" }, { authorization: "Bearer user-jwt" }));
    expect((await response.json()).status).toBe("preparing");
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("worker cần đúng khóa", async () => {
    const { handle, store } = setup();
    expect((await handle(post({ action: "work" }))).status).toBe(401);
    expect((await handle(post({ action: "work" }, { "x-worker-secret": "sai" }))).status).toBe(401);
    const response = await handle(post({ action: "work" }, { "x-worker-secret": "s".repeat(64) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, done: 0, retry: 0, failed: 0 });
    expect(store.claimJobs).toHaveBeenCalled();
  });

  it("kèm sổ đích → chuyển cho máy chủ tự thêm từ khi tạo xong", async () => {
    const { handle, store } = setup();
    const notebookId = "11111111-1111-4111-8111-111111111111";
    await handle(
      post(
        {
          lemma: "zygote",
          notebookId,
          contextSentence: "  A zygote forms. ",
          inputMethod: "typed",
        },
        { authorization: "Bearer user-jwt" },
      ),
    );
    expect(store.requestJob).toHaveBeenCalledWith("u1", "en", "zygote", null, {
      notebookId,
      contextSentence: "A zygote forms.",
      inputMethod: "typed",
    });
  });

  it("nhập file: chuyển ghi chú riêng và tag; Free → premium_required", async () => {
    const { handle, store } = setup();
    const notebookId = "11111111-1111-4111-8111-111111111111";
    const body = { lemma: "zygote", notebookId, inputMethod: "csv", note: "hợp tử", tags: ["bio"] };
    await handle(post(body, { authorization: "Bearer user-jwt" }));
    expect(store.requestJob).toHaveBeenCalledWith("u1", "en", "zygote", null, {
      notebookId,
      contextSentence: null,
      inputMethod: "csv",
      note: "hợp tử",
      tags: ["bio"],
    });
    vi.mocked(store.requestJob).mockResolvedValue({
      limitReached: true,
      dailyLimit: 50,
      premiumRequired: true,
    });
    const response = await handle(post(body, { authorization: "Bearer user-jwt" }));
    expect(WordResponseSchema.parse(await response.json()).status).toBe("premium_required");
  });

  it("hết lượt → limit_reached kèm gói hiện tại", async () => {
    const { handle, store } = setup();
    vi.mocked(store.requestJob).mockResolvedValue({
      limitReached: true,
      dailyLimit: 50,
      plan: "free",
    });
    const response = await handle(post({ lemma: "zygote" }, { authorization: "Bearer user-jwt" }));
    expect(WordResponseSchema.parse(await response.json())).toMatchObject({
      status: "limit_reached",
      dailyLimit: 50,
      plan: "free",
    });
  });

  it("resolve: tra nhiều từ, không tạo việc, khách cũng dùng được", async () => {
    const { handle, store } = setup();
    vi.mocked(store.findWords).mockImplementation(async (_language, lemma) =>
      lemma === "run"
        ? [
            {
              id: "w-run",
              senseIds: ["s1"],
              content: { lemma: "run", pos: "verb", cefr: "A1", senses: [{ meaning_vi: "chạy" }] },
              media: { audio: { us: null, uk: null }, images: [null] },
            } as never,
          ]
        : [],
    );
    const response = await handle(post({ action: "resolve", lemmas: ["Running", "zygote"] }));
    const body = ResolveResponseSchema.parse(await response.json());
    expect(body.items).toEqual([
      {
        input: "running",
        lemma: "run",
        alternatives: expect.any(Array),
        words: [
          {
            id: "w-run",
            lemma: "run",
            pos: "verb",
            cefr: "A1",
            senses: [{ id: "s1", meaning_vi: "chạy" }],
          },
        ],
      },
      { input: "zygote", lemma: "zygote", alternatives: [], words: [] },
    ]);
    expect(store.requestJob).not.toHaveBeenCalled();
    expect((await handle(post({ action: "resolve", lemmas: [] }))).status).toBe(400);
    expect(
      (await handle(post({ action: "resolve", lemmas: Array.from({ length: 51 }, () => "a") })))
        .status,
    ).toBe(400);
  });

  it("lỗi database → 500, không lộ chi tiết", async () => {
    const { handle, store } = setup();
    vi.mocked(store.findWords).mockRejectedValue(new Error("connection refused 10.0.0.1"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handle(post({ lemma: "run" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.1");
  });
});
