/**
 * Tải trang web cho tab Link (chạy trong Edge Function): tự đi theo chuyển hướng (tối đa 5 lần, kiểm
 * tra lại địa chỉ mỗi lần), chỉ nhận HTML/văn bản, tối đa MAX_PAGE_BYTES, hết giờ sau
 * FETCH_TIMEOUT_MS. Đọc bảng mã theo header hoặc thẻ <meta charset>.
 */
import { checkArticleUrl } from "./url";

export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

export type FetchedPage =
  | { ok: true; url: string; html: string; kind: "html" | "text" }
  | { ok: false; reason: "blocked" | "fetch_failed" | "not_html" | "too_large" };

/** Bảng mã: header Content-Type trước, rồi <meta charset> trong 4 KB đầu, mặc định UTF-8. */
export function detectCharset(contentType: string | null, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const ascii = new TextDecoder("latin1").decode(head.subarray(0, 4096));
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(ascii)?.[1] ??
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(ascii)?.[1];
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue;
    try {
      new TextDecoder(label);
      return label.toLowerCase();
    } catch {
      // Tên bảng mã lạ: thử cái tiếp theo.
    }
  }
  return "utf-8";
}

async function readLimited(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
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

export async function fetchPage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<FetchedPage> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = rawUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = checkArticleUrl(url);
      if (!check.ok) return { ok: false, reason: "blocked" };
      const response = await fetchImpl(check.url, {
        redirect: "manual",
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "accept-language": "en,vi;q=0.5",
          // Trang chặn trình tải lạ: xưng tên trình duyệt kèm tên app.
          "user-agent":
            "Mozilla/5.0 (compatible; WordWiseReader/1.0; +https://github.com/mrtitoong/wordwise)",
        },
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
