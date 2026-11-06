import { withSensePinyin } from "./pinyin";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toLexiconRows } from "../../../../scripts/build-zh-lexicon";
import { ZhWordContentSchema, type ZhWordContent } from "./content-schema";
import { allowedReadings, applyLexicon, parseLexicon } from "./lexicon";
import { numberedToMarked, pinyinKey, tonesOf } from "./pinyin";

describe("withSensePinyin", () => {
  const extra = { pinyin: "dāng", tones: [1], sense_pinyin: ["dāng", "dàng"] };

  it("sửa nghĩa đầu kéo theo pinyin và thanh điệu của từ", () => {
    expect(withSensePinyin(extra, 0, "dàng")).toEqual({
      pinyin: "dàng",
      tones: [4],
      sense_pinyin: ["dàng", "dàng"],
    });
  });

  it("sửa nghĩa sau không đổi pinyin của từ", () => {
    expect(withSensePinyin(extra, 1, "dāng")).toEqual({
      ...extra,
      sense_pinyin: ["dāng", "dāng"],
    });
  });
});

describe("pinyin", () => {
  it("đặt dấu đúng nguyên âm", () => {
    expect(numberedToMarked("ni3 hao3")).toBe("nǐ hǎo");
    expect(numberedToMarked("xue2 xiao4")).toBe("xué xiào");
    expect(numberedToMarked("gou3 liu2 dui4")).toBe("gǒu liú duì");
    expect(numberedToMarked("nu:3 ren2")).toBe("nǚ rén");
    expect(numberedToMarked("ma5")).toBe("ma");
  });

  it("âm cuốn lưỡi gắn vào âm tiết trước, thanh theo âm tiết", () => {
    expect(numberedToMarked("yi1 dian3 r5")).toBe("yī diǎnr");
    expect(tonesOf("yi1 dian3 r5")).toEqual([1, 3]);
    expect(tonesOf("dong1 xi5")).toEqual([1, 5]);
  });

  it("so âm không phân biệt dấu cách, hoa thường", () => {
    expect(pinyinKey("Dōng xi")).toBe(pinyinKey("dōngxi"));
    expect(pinyinKey("dōng xī")).not.toBe(pinyinKey("dōng xi"));
  });
});

describe("bảng âm đọc", () => {
  const lexicon = parseLexicon(
    [
      "# chú thích",
      "看\t看\tkan1\t1",
      "看\t看\tkan4\t1",
      "听\t听\tyin3\t0",
      "听\t聽\tting1\t1",
      "姓\t姓\txing4\t0",
    ].join("\n"),
  );
  const draft = (sense_pinyin: string[]) => ({
    language_extra: { traditional: null, pinyin: "x", tones: [1], sense_pinyin },
  });

  it("chỉ cho chọn âm thông dụng; không có thì mọi âm", () => {
    expect(allowedReadings(lexicon.get("听")).map((r) => r.pinyin)).toEqual(["tīng"]);
    expect(allowedReadings(lexicon.get("姓")).map((r) => r.pinyin)).toEqual(["xìng"]);
    expect(allowedReadings(undefined)).toEqual([]);
  });

  it("từ một âm: dùng âm từ điển, không tin AI", () => {
    const { content, flags } = applyLexicon(draft(["tìng"]), lexicon.get("听"));
    expect(content.language_extra).toMatchObject({
      traditional: "聽",
      pinyin: "tīng",
      tones: [1],
      sense_pinyin: ["tīng"],
    });
    expect(flags).toEqual([]);
  });

  it("từ nhiều âm: giữ âm AI chọn cho từng nghĩa", () => {
    const { content, flags } = applyLexicon(draft(["kàn", "kān"]), lexicon.get("看"));
    expect(content.language_extra).toMatchObject({
      pinyin: "kàn",
      tones: [4],
      sense_pinyin: ["kàn", "kān"],
    });
    expect(flags).toEqual([]);
  });

  it("âm ngoài danh sách hoặc từ không có trong từ điển thì báo cờ", () => {
    expect(applyLexicon(draft(["kǎn"]), lexicon.get("看")).flags).toEqual([
      { kind: "reading_not_allowed", sense: 0, pinyin: "kǎn" },
    ]);
    expect(applyLexicon(draft(["chē shàng"]), undefined).flags).toEqual([
      { kind: "not_in_dictionary" },
    ]);
  });

  it("file từ điển không chứa định nghĩa, có âm của từ thông dụng", () => {
    const text = readFileSync("data/zh/lexicon.tsv", "utf8");
    const rows = text.split("\n").filter((line) => line && !line.startsWith("#"));
    expect(rows.every((row) => row.split("\t").length === 4)).toBe(true);
    expect(allowedReadings(parseLexicon(text).get("学校")).map((r) => r.pinyin)).toEqual([
      "xué xiào",
    ]);
  });
});

describe("toLexiconRows", () => {
  it("bỏ định nghĩa và tên riêng; âm cổ, biến thể không thông dụng", () => {
    const rows = toLexiconRows(
      [
        "聽 听 [ting1] /to listen/",
        "听 听 [yin3] /smile (archaic)/",
        "張 张 [Zhang1] /surname Zhang/",
        "記 记 [ji4] /variant of 記/to record/",
      ].join("\n"),
    );
    expect(rows).toEqual(["听\t聽\tting1\t1", "听\t听\tyin3\t0", "记\t記\tji4\t1"]);
  });
});

describe("ZhWordContentSchema", () => {
  const content = (over: Partial<ZhWordContent> = {}) => ({
    schema_version: 1,
    language: "zh",
    lemma: "个",
    pos: "classifier",
    ipa: { us: null, uk: null },
    cefr: null,
    register: "neutral",
    etymology_vi: null,
    forms: { inflections: [], variants: [] },
    senses: [
      {
        definition_en: "general measure word",
        meaning_vi: "lượng từ chung",
        image_query: "three apples",
        examples: [{ sentence: "三个苹果", translation_vi: "ba quả táo", highlight: "个" }],
        synonyms: [],
        antonyms: [],
        collocations: [],
        idioms: [],
        common_mistakes: [],
      },
    ],
    homonyms: [],
    word_family: [],
    mnemonics: [],
    confusables: [],
    confidence: { collocations: 1, idioms: 1, mnemonics: 1 },
    language_extra: {
      kind: "zh",
      simplified: "个",
      traditional: "個",
      pinyin: "gè",
      tones: [4],
      hsk: 1,
      sense_pinyin: ["gè"],
    },
    ...over,
  });

  it("nhận lượng từ, CEFR và IPA để trống", () => {
    expect(ZhWordContentSchema.safeParse(content()).success).toBe(true);
  });

  it("mỗi nghĩa phải có một âm", () => {
    const extra = { ...content().language_extra, sense_pinyin: ["gè", "ge"] };
    const result = ZhWordContentSchema.safeParse({ ...content(), language_extra: extra });
    expect(result.success).toBe(false);
  });
});
