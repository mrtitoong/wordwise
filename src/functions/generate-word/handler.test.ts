import { describe, expect, it, vi } from "vitest";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { WordResponseSchema } from "@/lib/words/api";
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

  it("lỗi database → 500, không lộ chi tiết", async () => {
    const { handle, store } = setup();
    vi.mocked(store.findWords).mockRejectedValue(new Error("connection refused 10.0.0.1"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handle(post({ lemma: "run" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.1");
  });
});
