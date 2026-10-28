import { describe, expect, it, vi } from "vitest";
import type { FetchedPage } from "@/lib/article/fetch-page";
import { createArticleHandler, type ArticleDeps } from "./handler";

const ARTICLE = `<html><head><title>Flood lessons</title></head><body><article>${Array.from(
  { length: 5 },
  () =>
    "<p>Researchers say resilient communities recover faster after floods because neighbours share resources.</p>",
).join("")}</article></body></html>`;

function setup(overrides: Partial<ArticleDeps> = {}, page?: FetchedPage) {
  const deps: ArticleDeps = {
    fetchPage: vi.fn(
      async (url: string) => page ?? ({ ok: true, url, html: ARTICLE, kind: "html" } as const),
    ),
    getUserId: vi.fn(async (auth) => (auth ? "user-1" : null)),
    consumeUsage: vi.fn(async () => ({ allowed: true, dailyLimit: 20 })),
    ...overrides,
  };
  const handle = createArticleHandler(deps);
  const call = async (url: string, auth: string | null = "Bearer t") => {
    const response = await handle(
      new Request("https://fn/fetch-article", {
        method: "POST",
        headers: auth ? { authorization: auth } : {},
        body: JSON.stringify({ url }),
      }),
    );
    return response.json();
  };
  return { deps, call };
}

describe("fetch-article", () => {
  it("trả tiêu đề và nội dung bài", async () => {
    const { call, deps } = setup();
    const body = await call("example.com/flood");
    expect(body).toMatchObject({
      status: "ok",
      url: "https://example.com/flood",
      title: "Flood lessons",
      truncated: false,
    });
    expect(body.text).toContain("resilient communities");
    expect(deps.consumeUsage).toHaveBeenCalledWith("user-1");
  });

  it("khách thì mời đăng nhập, không tải trang", async () => {
    const { call, deps } = setup();
    expect(await call("https://example.com/a", null)).toEqual({ status: "login_required" });
    expect(deps.fetchPage).not.toHaveBeenCalled();
  });

  it("link nội bộ bị chặn trước khi trừ lượt", async () => {
    const { call, deps } = setup();
    expect(await call("http://localhost:54321/")).toEqual({ status: "blocked" });
    expect(deps.consumeUsage).not.toHaveBeenCalled();
  });

  it("hết lượt trong ngày", async () => {
    const { call, deps } = setup({
      consumeUsage: async () => ({ allowed: false, dailyLimit: 20 }),
    });
    expect(await call("https://example.com/a")).toEqual({
      status: "limit_reached",
      dailyLimit: 20,
    });
    expect(deps.fetchPage).not.toHaveBeenCalled();
  });

  it("báo lỗi tải trang, không phải bài, không phải tiếng Anh", async () => {
    expect(
      await setup({}, { ok: false, reason: "fetch_failed" }).call("https://example.com/a"),
    ).toEqual({ status: "fetch_failed" });
    expect(
      await setup({}, { ok: false, reason: "too_large" }).call("https://example.com/a"),
    ).toEqual({ status: "not_html" });
    expect(
      await setup(
        {},
        { ok: true, url: "https://a.com", html: "<p>Sign in</p>", kind: "html" },
      ).call("https://a.com"),
    ).toEqual({ status: "no_article" });
    const vietnamese = ARTICLE.replaceAll(
      "Researchers say resilient communities recover faster after floods because neighbours share resources.",
      "Các nhà nghiên cứu cho biết cộng đồng vững vàng phục hồi nhanh hơn sau lũ vì hàng xóm chia sẻ.",
    );
    expect(
      await setup({}, { ok: true, url: "https://a.com", html: vietnamese, kind: "html" }).call(
        "https://a.com",
      ),
    ).toEqual({ status: "not_english" });
  });

  it("văn bản thuần (.txt) dùng thẳng", async () => {
    const text = Array.from({ length: 3 }, () => "Resilient people bounce back quickly.").join(
      "\n\n",
    );
    const body = await setup(
      {},
      { ok: true, url: "https://a.com/notes.txt", html: `${text}\n\n${text}`, kind: "text" },
    ).call("https://a.com/notes.txt");
    expect(body).toMatchObject({ status: "ok", title: "notes.txt" });
    expect(body.text.split("\n\n")).toHaveLength(6);
  });

  it("dịch vụ lỗi thì unavailable", async () => {
    const { call } = setup({
      getUserId: async () => {
        throw new Error("down");
      },
    });
    expect(await call("https://example.com/a")).toEqual({ status: "unavailable" });
  });
});
