import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadExampleWords } from "@/lib/schema/examples";
import {
  dictionaryForPrompt,
  fetchFreeDictionary,
  parseFreeDictionary,
  phonemicIpa,
  primaryPos,
  reconcileIpa,
} from "./free-dictionary";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const resilient = loadExampleWords().find((w) => w.lemma === "resilient")!;

describe("parseFreeDictionary", () => {
  it("lấy IPA âm vị theo vùng của file audio, bỏ phiên âm hẹp [..]", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    // "/laɪt/" đi kèm light-uk.mp3; "[ɫɐɪ̯ʔ]" đi kèm light-us.mp3 → không dùng.
    expect(data.ipa).toEqual({ us: null, uk: "laɪt" });
  });

  it("gộp nghĩa theo loại từ, giữ thứ tự từ điển, tối đa 3 định nghĩa", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    expect(data.meanings.map((m) => m.pos)).toEqual(["noun", "verb", "adjective", "adverb"]);
    expect(data.meanings[0]!.definitions).toHaveLength(3);
    expect(primaryPos(data)).toBe("noun");
  });

  it("không có text IPA thì để null", () => {
    const data = parseFreeDictionary(fixture("resilient"))!;
    expect(data.ipa).toEqual({ us: null, uk: null });
    expect(data.meanings[0]!.pos).toBe("adjective");
  });

  it("dữ liệu lạ → null", () => {
    expect(parseFreeDictionary({ title: "No Definitions Found" })).toBeNull();
    expect(parseFreeDictionary([])).toBeNull();
    expect(primaryPos(null)).toBeNull();
  });

  it("phonemicIpa", () => {
    expect(phonemicIpa("/rʌn/")).toBe("rʌn");
    expect(phonemicIpa("[ɹʌn]")).toBeNull();
    expect(phonemicIpa("")).toBeNull();
    expect(phonemicIpa(null)).toBeNull();
  });
});

describe("dictionaryForPrompt", () => {
  it("chỉ giữ loại từ đang tạo", () => {
    const data = parseFreeDictionary(fixture("light"))!;
    expect(dictionaryForPrompt(data, "verb")!.meanings.map((m) => m.pos)).toEqual(["verb"]);
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
    expect(data?.ipa.uk).toBe("laɪt");
  });
});

describe("reconcileIpa", () => {
  it("IPA lệch → dùng từ điển", () => {
    const { content, replaced } = reconcileIpa(resilient, {
      ipa: { us: "rɪˈzɪljənt", uk: "rɪˈzɪlɪənt" },
      meanings: [],
    });
    // us chỉ khác dấu tách âm tiết → giữ bản LLM; uk khác thật → thay.
    expect(content.ipa).toEqual({ us: "rɪˈzɪl.jənt", uk: "rɪˈzɪlɪənt" });
    expect(replaced).toEqual(["uk"]);
  });

  it("từ điển thiếu vùng nào thì giữ LLM vùng đó", () => {
    const { content, replaced } = reconcileIpa(resilient, {
      ipa: { us: null, uk: null },
      meanings: [],
    });
    expect(content).toBe(resilient);
    expect(replaced).toEqual([]);
  });
});
