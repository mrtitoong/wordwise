import { describe, expect, it } from "vitest";
import { extractArticle, looksEnglish, truncateParagraphs } from "./extract";
import { detectCharset, fetchPage, MAX_PAGE_BYTES } from "./fetch-page";
import { checkArticleUrl, normalizeUrlInput } from "./url";

const BODY = Array.from(
  { length: 6 },
  (_, i) =>
    `<p>Paragraph ${i + 1}: Researchers say resilient communities recover faster after floods, ` +
    `because neighbours share resources and local leaders coordinate the response quickly.</p>`,
).join("");

const PAGE = `<!doctype html><html><head><title>Flood lessons | The Daily</title>
<meta property="og:site_name" content="The Daily"></head><body>
<nav><a href="/">Home</a> <a href="/world">World</a> <a href="/login">Sign in</a></nav>
<article><h1>Flood lessons</h1>${BODY}<ul><li>First point about drainage systems.</li></ul></article>
<aside class="comments"><p>Great post!!!</p></aside>
<footer>© 2026 The Daily. All rights reserved.</footer></body></html>`;

describe("checkArticleUrl", () => {
  it("nhận link công khai, tự thêm https:// và bỏ #", () => {
    expect(checkArticleUrl("example.com/news/a#top")).toEqual({
      ok: true,
      url: "https://example.com/news/a",
    });
    expect(checkArticleUrl("http://8.8.8.8/x")).toMatchObject({ ok: true });
    expect(normalizeUrlInput("  https://a.com ")).toBe("https://a.com");
  });

  it("chặn địa chỉ nội bộ, cổng lạ, tài khoản trong link", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://10.0.0.5/",
      "http://172.20.1.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/",
      "http://[::1]/",
      "http://intranet/",
      "http://printer.local/",
      "http://db.internal/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
    ]) {
      expect(checkArticleUrl(url), url).toMatchObject({ ok: false, reason: "blocked" });
    }
  });

  it("không phải http(s) hoặc không đọc được thì là link sai", () => {
    expect(checkArticleUrl("ftp://example.com/a")).toMatchObject({ reason: "invalid_url" });
    expect(checkArticleUrl("javascript:alert(1)")).toMatchObject({ reason: "invalid_url" });
    expect(checkArticleUrl("https://")).toMatchObject({ ok: false });
  });
});

describe("extractArticle", () => {
  it("lấy tiêu đề, tên trang và các đoạn của bài; bỏ menu, bình luận, chân trang", () => {
    const article = extractArticle(PAGE, "https://daily.example/flood")!;
    expect(article.title).toContain("Flood lessons");
    expect(article.siteName).toBe("The Daily");
    expect(article.truncated).toBe(false);
    const paragraphs = article.text.split("\n\n");
    expect(paragraphs.some((p) => p.startsWith("Paragraph 1: Researchers"))).toBe(true);
    expect(paragraphs).toContain("First point about drainage systems.");
    expect(article.text).not.toMatch(/Sign in|Great post|All rights reserved/);
  });

  it("bỏ dấu chú thích kiểu Wikipedia", () => {
    const page = PAGE.replace("<h1>Flood lessons</h1>", "<h2>History[edit]</h2>").replace(
      "quickly.</p>",
      "quickly.[12][citation needed]</p>",
    );
    const text = extractArticle(page, "https://wiki.example/a")!.text;
    expect(text).toContain("response quickly.\n\nParagraph 2");
    expect(text).not.toMatch(/\[edit\]|\[12\]|citation needed/);
  });

  it("trang quá ít chữ thì không phải bài viết", () => {
    expect(
      extractArticle("<html><body><p>Log in to continue.</p></body></html>", "https://a.com"),
    ).toBeNull();
  });
});

describe("truncateParagraphs", () => {
  it("cắt ở cuối đoạn khi quá dài", () => {
    expect(truncateParagraphs(["aaaa", "bbbb", "cccc"], 10)).toEqual({
      text: "aaaa\n\nbbbb",
      truncated: true,
    });
    expect(truncateParagraphs(["aa", "bb"], 10)).toEqual({ text: "aa\n\nbb", truncated: false });
  });

  it("đoạn đầu đã quá dài thì cắt ở khoảng trắng", () => {
    const { text, truncated } = truncateParagraphs(["one two three four five six"], 15);
    expect(truncated).toBe(true);
    expect(text).toBe("one two three");
  });
});

describe("looksEnglish", () => {
  it("phân biệt tiếng Anh với tiếng Việt", () => {
    expect(looksEnglish("Researchers say resilient communities recover faster.")).toBe(true);
    expect(looksEnglish("Các nhà nghiên cứu cho biết cộng đồng phục hồi nhanh hơn sau lũ.")).toBe(
      false,
    );
    expect(looksEnglish("")).toBe(false);
  });
});

describe("fetchPage", () => {
  const html = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...headers } });

  it("đi theo chuyển hướng và kiểm tra lại địa chỉ mới", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url === "https://a.com/old") {
        return new Response(null, { status: 301, headers: { location: "/new" } });
      }
      return html("<p>hi</p>");
    }) as unknown as typeof fetch;
    const page = await fetchPage("https://a.com/old", fetchImpl);
    expect(page).toMatchObject({ ok: true, url: "https://a.com/new", kind: "html" });
    expect(calls).toEqual(["https://a.com/old", "https://a.com/new"]);
  });

  it("chuyển hướng vào mạng nội bộ thì chặn", async () => {
    const fetchImpl = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/" },
      })) as unknown as typeof fetch;
    expect(await fetchPage("https://a.com/x", fetchImpl)).toEqual({
      ok: false,
      reason: "blocked",
    });
  });

  it("không phải HTML, quá lớn, lỗi HTTP, lỗi mạng", async () => {
    const pdf = (async () =>
      new Response("%PDF", { headers: { "content-type": "application/pdf" } })) as never;
    expect(await fetchPage("https://a.com/x.pdf", pdf)).toMatchObject({ reason: "not_html" });

    const big = (async () => html("x".repeat(MAX_PAGE_BYTES + 1))) as never;
    expect(await fetchPage("https://a.com/big", big)).toMatchObject({ reason: "too_large" });

    const missing = (async () => new Response("no", { status: 404 })) as never;
    expect(await fetchPage("https://a.com/404", missing)).toMatchObject({
      reason: "fetch_failed",
    });

    const offline = (async () => {
      throw new TypeError("network");
    }) as never;
    expect(await fetchPage("https://a.com/", offline)).toMatchObject({ reason: "fetch_failed" });
  });

  it("đọc bảng mã theo <meta charset>", async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="windows-1252"><p>caf'),
      0xe9,
      ...new TextEncoder().encode("</p>"),
    ]);
    const fetchImpl = (async () =>
      new Response(bytes, { headers: { "content-type": "text/html" } })) as never;
    const page = await fetchPage("https://a.com/", fetchImpl);
    expect(page.ok && page.html).toContain("café");
    expect(detectCharset("text/html; charset=ISO-8859-1", new Uint8Array())).toBe("iso-8859-1");
    expect(detectCharset(null, new Uint8Array())).toBe("utf-8");
  });
});
