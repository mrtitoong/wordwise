import { describe, expect, it, vi } from "vitest";
import { loadExampleWords } from "@/lib/schema/examples";
import { createAdminWordHandler, type AdminWordDeps } from "./handler";

const bank = loadExampleWords().find((w) => w.lemma === "bank")!;
const WORD_ID = "11111111-1111-4111-8111-111111111111";

function setup(overrides: Partial<AdminWordDeps> = {}) {
  const deps: AdminWordDeps = {
    getUserId: vi.fn(async (auth) =>
      auth === "Bearer admin-jwt" ? "admin" : auth ? "user" : null,
    ),
    isAdmin: vi.fn(async (id) => id === "admin"),
    loadWord: vi.fn(async (id) => (id === WORD_ID ? bank : null)),
    generate: vi.fn(async () => ({
      ...bank,
      mnemonics: [{ type: "sound" as const, text_vi: "mẹo mới" }],
    })),
    ...overrides,
  };
  return { handle: createAdminWordHandler(deps), deps };
}

const post = (body: unknown, auth: string | null = "Bearer admin-jwt") =>
  new Request("http://localhost/admin-word", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe("admin-word handler", () => {
  it("Admin tạo lại tab Ghi nhớ → trả nội dung đã ghép, không đổi tab khác", async () => {
    const { handle, deps } = setup();
    const response = await handle(post({ wordId: WORD_ID, tab: "memory" }));
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.content.mnemonics).toEqual([{ type: "sound", text_vi: "mẹo mới" }]);
    expect(body.content.senses).toEqual(bank.senses);
    expect(deps.generate).toHaveBeenCalledWith(bank, "memory");
  });

  it("người dùng thường hoặc chưa đăng nhập bị chặn, không gọi AI", async () => {
    const { handle, deps } = setup();
    expect((await handle(post({ wordId: WORD_ID, tab: "memory" }, "Bearer user-jwt"))).status).toBe(
      403,
    );
    expect((await handle(post({ wordId: WORD_ID, tab: "memory" }, null))).status).toBe(403);
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("yêu cầu sai, từ không có, AI lỗi", async () => {
    const { handle } = setup();
    expect((await handle(post({ wordId: "x", tab: "memory" }))).status).toBe(400);
    expect((await handle(post({ wordId: WORD_ID, tab: "slang" }))).status).toBe(400);
    expect(
      (await handle(post({ wordId: "22222222-2222-4222-8222-222222222222", tab: "examples" })))
        .status,
    ).toBe(404);

    const failing = setup({ generate: vi.fn(async () => Promise.reject(new Error("boom"))) });
    const body = await (await failing.handle(post({ wordId: WORD_ID, tab: "examples" }))).json();
    expect(body).toEqual({ status: "unavailable" });
    const noKey = setup({ generate: null });
    expect(await (await noKey.handle(post({ wordId: WORD_ID, tab: "examples" }))).json()).toEqual({
      status: "unavailable",
    });
  });
});
