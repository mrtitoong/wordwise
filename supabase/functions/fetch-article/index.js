// File sinh tự động từ src/functions/fetch-article/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/fetch-article/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// src/lib/article/dns.ts
var DOH_URL = "https://cloudflare-dns.com/dns-query";
var RECORD_TYPES = { A: 1, AAAA: 28 };
function isNotFound(error) {
  return error instanceof Error && error.name === "NotFound";
}
async function resolveDoh(host, fetchImpl) {
  const out = [];
  for (const [type, code] of Object.entries(RECORD_TYPES)) {
    const url = `${DOH_URL}?name=${encodeURIComponent(host)}&type=${type}`;
    const response = await fetchImpl(url, { headers: { accept: "application/dns-json" } });
    if (!response.ok) throw new Error(`DoH ${response.status}`);
    const body = await response.json();
    for (const answer of body.Answer ?? []) {
      if (answer.type === code) out.push(answer.data);
    }
  }
  return out;
}
function createResolver(deps) {
  return async (host) => {
    if (deps.resolveDns) {
      const results = await Promise.allSettled([
        deps.resolveDns(host, "A"),
        deps.resolveDns(host, "AAAA")
      ]);
      if (results.every((r) => r.status === "fulfilled" || isNotFound(r.reason))) {
        return results.flatMap((r) => r.status === "fulfilled" ? r.value : []);
      }
    }
    return resolveDoh(host, deps.fetch);
  };
}

// src/lib/article/url.ts
var MAX_URL_LENGTH = 2e3;
var BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".arpa"];
function privateIpv4(host) {
  const parts = host.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a === 100 && b >= 64 && b <= 127 || // CGNAT
  a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 192 && b === 0 || a === 198 && (b === 18 || b === 19) || a >= 224;
}
function parseIpv6(raw) {
  let text = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  let tail = [];
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    tail = [a << 8 | b, c << 8 | d];
    text = text.slice(0, -v4[0].length);
    if (text.endsWith(":") && !text.endsWith("::")) text = text.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part) => part ? part.split(":").map((h) => /^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN) : [];
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  const known = head.length + rest.length + tail.length;
  if (halves.length === 1 ? known !== 8 : known > 7) return null;
  const out = [...head, ...new Array(8 - known).fill(0), ...rest, ...tail];
  return out.some(Number.isNaN) ? null : out;
}
function isPrivateIp(ip) {
  if (/^\d+(\.\d+){3}$/.test(ip)) {
    return ip.split(".").some((n) => Number(n) > 255) || privateIpv4(ip);
  }
  const g = parseIpv6(ip);
  if (!g) return true;
  const [g0, g1, g2] = g;
  if ((g0 & 57344) !== 8192) return true;
  if (g0 === 8193 && (g1 === 3512 || g1 === 0)) return true;
  if (g0 === 8194) return privateIpv4(`${g1 >> 8}.${g1 & 255}.${g2 >> 8}.${g2 & 255}`);
  return false;
}
function normalizeUrlInput(raw) {
  const value = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}
function checkArticleUrl(raw) {
  const input = normalizeUrlInput(raw);
  if (!input || input.length > MAX_URL_LENGTH) return { ok: false, reason: "invalid_url" };
  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.username || url.password) return { ok: false, reason: "blocked" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: "blocked" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || host.includes(":")) return { ok: false, reason: "blocked" };
  if (/^\d+(\.\d+){3}$/.test(host)) {
    return isPrivateIp(host) ? { ok: false, reason: "blocked" } : { ok: true, url: url.href };
  }
  if (!host.includes(".") || host === "localhost") return { ok: false, reason: "blocked" };
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "blocked" };
  }
  url.hash = "";
  return { ok: true, url: url.href };
}

// src/lib/article/fetch-page.ts
var MAX_PAGE_BYTES = 5 * 1024 * 1024;
var FETCH_TIMEOUT_MS = 1e4;
var MAX_REDIRECTS = 5;
function detectCharset(contentType, head) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const ascii = new TextDecoder("latin1").decode(head.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(ascii)?.[1] ?? /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(ascii)?.[1];
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue;
    try {
      new TextDecoder(label);
      return label.toLowerCase();
    } catch {
    }
  }
  return "utf-8";
}
async function readLimited(body) {
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
async function fetchPage(rawUrl, { fetch: fetchImpl, resolveHost: resolveHost2 }, timeoutMs = FETCH_TIMEOUT_MS) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = rawUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = checkArticleUrl(url);
      if (!check.ok) return { ok: false, reason: "blocked" };
      const host = new URL(check.url).hostname;
      if (!/^\d+(\.\d+){3}$/.test(host)) {
        const addresses = await resolveHost2(host);
        if (addresses.length === 0) return { ok: false, reason: "fetch_failed" };
        if (addresses.some(isPrivateIp)) return { ok: false, reason: "blocked" };
      }
      const response = await fetchImpl(check.url, {
        redirect: "manual",
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "accept-language": "en,vi;q=0.5",
          // Trang chặn trình tải lạ: xưng tên trình duyệt kèm tên app.
          "user-agent": "Mozilla/5.0 (compatible; WordWiseReader/1.0; +https://github.com/mrtitoong/wordwise)"
        }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return { ok: false, reason: "fetch_failed" };
        url = new URL(location, check.url).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return { ok: false, reason: "fetch_failed" };
      }
      const type = response.headers.get("content-type") ?? "";
      const kind = /html|xml/i.test(type) ? "html" : /^text\/plain/i.test(type) ? "text" : null;
      if (!kind) {
        await response.body.cancel();
        return { ok: false, reason: "not_html" };
      }
      const declared = Number(response.headers.get("content-length"));
      if (declared > MAX_PAGE_BYTES) {
        await response.body.cancel();
        return { ok: false, reason: "too_large" };
      }
      const bytes = await readLimited(response.body);
      if (!bytes) return { ok: false, reason: "too_large" };
      const html = new TextDecoder(detectCharset(type, bytes)).decode(bytes);
      return { ok: true, url: check.url, html, kind };
    }
    return { ok: false, reason: "fetch_failed" };
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }
}

// src/functions/fetch-article/handler.ts
import { z as z2 } from "npm:zod@4.6.5";

// src/lib/article/api.ts
import { z } from "npm:zod@4.6.5";
var ArticleRequestSchema = z.object({
  url: z.string().trim().min(4).max(MAX_URL_LENGTH)
});
var ArticleResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** Địa chỉ cuối cùng (sau chuyển hướng), lưu làm nguồn của từ. */
    url: z.string(),
    title: z.string(),
    siteName: z.string().nullable(),
    /** Văn bản thuần, các đoạn cách nhau bằng dòng trống. */
    text: z.string(),
    /** Bài quá dài, chỉ lấy phần đầu. */
    truncated: z.boolean()
  }),
  z.object({ status: z.literal("invalid_url") }),
  /** Địa chỉ nội bộ/không được phép. */
  z.object({ status: z.literal("blocked") }),
  /** Trang lỗi, cần đăng nhập, chặn trình tải, hết giờ… */
  z.object({ status: z.literal("fetch_failed") }),
  /** Không phải trang web (PDF, ảnh…) hoặc quá lớn. */
  z.object({ status: z.literal("not_html") }),
  /** Không tìm thấy nội dung bài (trang chủ, trang chỉ hiện bằng JavaScript…). */
  z.object({ status: z.literal("no_article") }),
  z.object({ status: z.literal("not_english") }),
  z.object({ status: z.literal("login_required") }),
  z.object({ status: z.literal("limit_reached"), dailyLimit: z.number().int() }),
  /** Mất mạng hoặc dịch vụ lỗi. */
  z.object({ status: z.literal("unavailable") })
]);

// src/lib/article/extract.ts
import { Readability } from "npm:@mozilla/readability@0.6.0";
import { parseHTML } from "npm:linkedom@0.18.13";
var MAX_ARTICLE_CHARS = 5e4;
var MIN_ARTICLE_WORDS = 30;
var BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, dt, dd, td, th";
var clean = (text) => (text ?? "").replace(/\[(?:edit|\d+|[a-z]|citation needed|clarification needed)\]/gi, "").replace(/\s+/g, " ").trim();
function paragraphsOf(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = [...document.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS));
  return blocks.map((el) => clean(el.textContent)).filter(Boolean);
}
function countWords(text) {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}
function truncateParagraphs(paragraphs, max = MAX_ARTICLE_CHARS) {
  const kept = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const extra = (kept.length ? 2 : 0) + paragraph.length;
    if (length + extra > max) {
      if (kept.length === 0) {
        const cut = paragraph.slice(0, max);
        const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
        kept.push(end > max / 2 ? cut.slice(0, end + 1).trim() : cut);
      }
      return { text: kept.join("\n\n"), truncated: true };
    }
    kept.push(paragraph);
    length += extra;
  }
  return { text: kept.join("\n\n"), truncated: false };
}
function extractArticle(html, url) {
  const { document } = parseHTML(html);
  try {
    Object.defineProperty(document, "documentURI", { value: url, configurable: true });
    Object.defineProperty(document, "baseURI", { value: url, configurable: true });
  } catch {
  }
  const pageTitle = clean(document.querySelector("title")?.textContent);
  let parsed = null;
  try {
    parsed = new Readability(document, { charThreshold: 300 }).parse();
  } catch {
    parsed = null;
  }
  if (!parsed?.content) return null;
  let paragraphs = paragraphsOf(parsed.content);
  const plain = clean(parsed.textContent);
  if (paragraphs.join(" ").length < plain.length * 0.5) {
    paragraphs = (parsed.textContent ?? "").split(/\n\s*\n|\n/).map(clean).filter(Boolean);
  }
  const { text, truncated } = truncateParagraphs(paragraphs);
  if (countWords(text) < MIN_ARTICLE_WORDS) return null;
  return {
    title: clean(parsed.title) || pageTitle || new URL(url).hostname,
    siteName: clean(parsed.siteName) || null,
    text,
    truncated
  };
}
function looksEnglish(text) {
  const words = text.match(/\p{L}+/gu) ?? [];
  if (words.length === 0) return false;
  const latin = words.filter((w) => /^[a-z]+$/i.test(w)).length;
  return latin / words.length >= 0.8;
}

// src/functions/fetch-article/handler.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}
function createArticleHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let url;
    try {
      ({ url } = ArticleRequestSchema.parse(await request.json()));
    } catch (error) {
      return json({ error: error instanceof z2.ZodError ? "invalid_request" : "invalid_json" }, 400);
    }
    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId) return json({ status: "login_required" });
      const check = checkArticleUrl(url);
      if (!check.ok) return json({ status: check.reason });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });
      const page = await deps.fetchPage(check.url);
      if (!page.ok) {
        return json({ status: page.reason === "too_large" ? "not_html" : page.reason });
      }
      const article = page.kind === "text" ? {
        title: new URL(page.url).pathname.split("/").pop() || new URL(page.url).hostname,
        siteName: null,
        ...truncateParagraphs(
          page.html.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
        )
      } : extractArticle(page.html, page.url);
      if (!article || countWords(article.text) < MIN_ARTICLE_WORDS) {
        return json({ status: "no_article" });
      }
      if (!looksEnglish(article.text)) return json({ status: "not_english" });
      return json({ status: "ok", url: page.url, ...article });
    } catch (error) {
      console.error("fetch-article lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}

// src/functions/fetch-article/main.ts
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}
var supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
var resolveHost = createResolver({
  resolveDns: Deno.resolveDns && ((host, type) => Deno.resolveDns(host, type)),
  fetch
});
Deno.serve(
  createArticleHandler({
    fetchPage: (url) => fetchPage(url, { fetch, resolveHost }),
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "article"
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data;
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    }
  })
);
