import { describe, expect, it, vi } from "vitest";
import type { AnalysisDeps, AnalysisStore } from "@/lib/admin/analysis/pipeline";
import { createAnalyzeListHandler, type AnalyzeListDeps } from "./handler";

const SECRET = "s".repeat(40);

function worker(claim: AnalysisStore["claimJob"]): AnalysisDeps {
  return {
    store: { claimJob: claim } as AnalysisStore,
    llm: { generateJSON: vi.fn() },
    templates: {} as AnalysisDeps["templates"],
    lemmatizer: { verb: (w) => w, noun: (w) => w, adjective: (w) => w },
    newId: () => "id",
  };
}

function deps(patch: Partial<AnalyzeListDeps> = {}): AnalyzeListDeps {
  return {
    worker: worker(async () => null),
    verifyWorkerSecret: async (secret) => secret === SECRET,
    kickNext: vi.fn(async () => undefined),
    ...patch,
  };
}

const post = (body: unknown, secret = SECRET) =>
  new Request("http://x/analyze-list", {
    method: "POST",
    headers: { "x-worker-secret": secret },
    body: JSON.stringify(body),
  });

describe("analyze-list", () => {
  it("chỉ worker có khóa đúng mới chạy", async () => {
    const handle = createAnalyzeListHandler(deps());
    expect((await handle(post({ action: "work" }, "sai"))).status).toBe(401);
    expect((await handle(post({ action: "khac" }))).status).toBe(400);
    expect((await handle(new Request("http://x", { method: "GET" }))).status).toBe(405);
  });

  it("chưa có khóa LLM → 503", async () => {
    const handle = createAnalyzeListHandler(deps({ worker: null }));
    expect((await handle(post({ action: "work" }))).status).toBe(503);
  });

  it("không có việc → trả kết quả rỗng, không gọi lượt tiếp", async () => {
    const d = deps();
    const response = await createAnalyzeListHandler(d)(post({ action: "work" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [], more: false });
    expect(d.kickNext).not.toHaveBeenCalled();
  });

  it("hết giờ giữa chừng → gọi lượt worker mới", async () => {
    const store = {
      claimJob: vi.fn(async () => ({
        id: "j",
        listId: "l",
        step: "extract" as const,
        done: 0,
        total: 0,
        options: {},
        state: {},
        attempts: 0,
        list: { language: "en" as const, targetCefr: null, title: "t", topic: null, purpose: null },
      })),
      saveJob: vi.fn(async () => undefined),
    };
    const w = { ...worker(store.claimJob), store: store as unknown as AnalysisStore };
    // Ngân sách nhỏ hơn thời gian tối thiểu của bước có LLM → trả việc ngay.
    const d = deps({ worker: w, budgetMs: 30_000 });
    const body = await (await createAnalyzeListHandler(d)(post({ action: "work" }))).json();
    expect(body).toEqual({ runs: [{ jobId: "j", outcome: "continue" }], more: true });
    expect(store.saveJob).toHaveBeenCalledWith("j", expect.objectContaining({ step: "extract" }));
    expect(d.kickNext).toHaveBeenCalledOnce();
  });
});
