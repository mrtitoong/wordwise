import { describe, expect, it } from "vitest";
import {
  assetUrlsInHtml,
  classifyRequest,
  keysToTrim,
  parseRange,
  type RequestInfo,
} from "./sw-policy";

const ORIGIN = "https://wordwise.app";
const get = (url: string, extra: Partial<RequestInfo> = {}): RequestInfo => ({
  url,
  method: "GET",
  mode: "cors",
  destination: "",
  ...extra,
});

describe("classifyRequest", () => {
  it("JS/CSS của Next và icon là static", () => {
    expect(classifyRequest(get(`${ORIGIN}/_next/static/chunks/a1b2.js`), ORIGIN)).toBe("static");
    expect(classifyRequest(get(`${ORIGIN}/icons/icon-192.png`), ORIGIN)).toBe("static");
    expect(classifyRequest(get(`${ORIGIN}/apple-icon.png`), ORIGIN)).toBe("static");
  });

  it("mở trang là page, trừ trang cần mạng (đăng nhập, quản trị)", () => {
    const nav = (path: string) => get(`${ORIGIN}${path}`, { mode: "navigate" });
    expect(classifyRequest(nav("/"), ORIGIN)).toBe("page");
    expect(classifyRequest(nav("/review/session?practice=1"), ORIGIN)).toBe("page");
    expect(classifyRequest(nav("/words/abc"), ORIGIN)).toBe("page");
    expect(classifyRequest(nav("/login"), ORIGIN)).toBe("bypass");
    expect(classifyRequest(nav("/auth/confirm?token_hash=x"), ORIGIN)).toBe("bypass");
    expect(classifyRequest(nav("/admin/lists/1"), ORIGIN)).toBe("bypass");
    // "/administrator" không phải khu admin.
    expect(classifyRequest(nav("/administrator"), ORIGIN)).toBe("page");
  });

  it("dữ liệu RSC, server action, POST không lưu", () => {
    expect(classifyRequest(get(`${ORIGIN}/stats?_rsc=1x2`), ORIGIN)).toBe("bypass");
    expect(classifyRequest(get(`${ORIGIN}/`, { method: "POST", mode: "navigate" }), ORIGIN)).toBe(
      "bypass",
    );
  });

  it("audio công khai và ảnh minh họa là media; ảnh riêng, REST, Edge Function thì không", () => {
    const sb = "https://x.supabase.co";
    expect(
      classifyRequest(get(`${sb}/storage/v1/object/public/audio/en/run/verb/us.mp3`), ORIGIN),
    ).toBe("media");
    expect(
      classifyRequest(
        get("https://images.pexels.com/photos/1/a.jpeg?w=640", { destination: "image" }),
        ORIGIN,
      ),
    ).toBe("media");
    expect(
      classifyRequest(get(`${sb}/storage/v1/object/sign/user-images/u/a.webp?token=t`), ORIGIN),
    ).toBe("bypass");
    expect(classifyRequest(get(`${sb}/rest/v1/cards?select=*`), ORIGIN)).toBe("bypass");
    expect(classifyRequest(get(`${sb}/functions/v1/word-media`), ORIGIN)).toBe("bypass");
    expect(classifyRequest(get("not a url"), ORIGIN)).toBe("bypass");
  });
});

describe("assetUrlsInHtml", () => {
  it("lấy đường dẫn JS/CSS, bỏ trùng", () => {
    const html =
      '<link rel="stylesheet" href="/_next/static/css/a.css"/><script src="/_next/static/chunks/b.js" async></script>' +
      '<script>self.__next_f.push([1,"\\"/_next/static/chunks/c.js\\""])</script><script src="/_next/static/chunks/b.js"></script>';
    expect(assetUrlsInHtml(html)).toEqual([
      "/_next/static/css/a.css",
      "/_next/static/chunks/b.js",
      "/_next/static/chunks/c.js",
    ]);
  });
});

describe("keysToTrim", () => {
  it("xóa mục cũ nhất khi vượt giới hạn", () => {
    expect(keysToTrim(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
    expect(keysToTrim(["a"], 2)).toEqual([]);
  });
});

describe("parseRange", () => {
  it("đọc các dạng Range của thẻ <audio>", () => {
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("Range không hợp lệ hoặc ngoài file thì null", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=2000-", 1000)).toBeNull();
    expect(parseRange("bytes=5-1", 1000)).toBeNull();
  });
});
