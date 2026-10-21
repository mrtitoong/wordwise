import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { dictionaryForPrompt, fetchFreeDictionary, parseFreeDictionary } from "./free-dictionary";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

describe("parseFreeDictionary", () => {
  it("gộp nghĩa theo loại từ, giữ thứ tự từ điển, tối đa 3 định nghĩa", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    expect(data.meanings.map((m) => m.pos)).toEqual(["noun", "verb", "adjective", "adverb"]);
    expect(data.meanings[0]!.definitions).toHaveLength(3);
  });

  it("không lấy IPA của từ điển (phiên âm kỹ thuật khó đọc)", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    expect(JSON.stringify(data)).not.toContain("ɫɐɪ̯ʔ");
    expect(data).not.toHaveProperty("ipa");
  });

  it("dữ liệu lạ → null", () => {
    expect(parseFreeDictionary({ title: "No Definitions Found" })).toBeNull();
    expect(parseFreeDictionary([])).toBeNull();
    expect(parseFreeDictionary(fixture("resilient"))!.meanings[0]!.pos).toBe("adjective");
  });
});

describe("dictionaryForPrompt", () => {
  it("chỉ giữ loại từ đang tạo; không có thì bỏ hẳn", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    expect(dictionaryForPrompt(data, "verb")!.meanings.map((m) => m.pos)).toEqual(["verb"]);
    expect(dictionaryForPrompt(data, null)!.meanings).toHaveLength(4);
    expect(dictionaryForPrompt(data, "pronoun")).toBeUndefined();
    expect(dictionaryForPrompt(null, "verb")).toBeUndefined();
  });
});

describe("fetchFreeDictionary", () => {
  it("lỗi mạng, 404, 5xx đều trả null", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchFreeDictionary("run", { fetch: failing })).toBeNull();
    const notFound = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await fetchFreeDictionary("run", { fetch: notFound })).toBeNull();
    const down = vi.fn().mockResolvedValue(new Response("error code: 1033", { status: 530 }));
    expect(await fetchFreeDictionary("run", { fetch: down })).toBeNull();
  });

  it("mã hóa từ trong URL", async () => {
    const ok = vi.fn().mockResolvedValue(Response.json(fixture("light")));
    const data = await fetchFreeDictionary("give up", { fetch: ok });
    expect(ok.mock.calls[0]![0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/give%20up");
    expect(data?.meanings[0]?.pos).toBe("noun");
  });
});
