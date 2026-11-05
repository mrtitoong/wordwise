import { describe, expect, it } from "vitest";
import { splitHighlight } from "@/lib/words/highlight";
import { wordsByLanguage } from "../filter";
import { pinyinOfSense, zhCardInfo } from "./card";
import { applyHanViet, hanVietRule } from "./han-viet";
import { parseLexicon } from "./lexicon";
import { sentencePinyin, sentenceWords } from "./sentence-pinyin";

const table = new Map([
  ["银", ["ngân"]],
  ["行", ["hành", "hạnh", "hàng"]],
  ["学", ["học"]],
]);

describe("applyHanViet", () => {
  it("chữ nhiều âm lấy âm AI chọn", () => {
    expect(applyHanViet(["ngân", "hàng"], "银行", table)).toEqual({
      hanViet: ["ngân", "hàng"],
      flags: [],
    });
  });

  it("âm ngoài danh sách hoặc thiếu thì dùng âm đầu và báo cờ", () => {
    expect(applyHanViet(["ngân", "hang"], "银行", table)).toEqual({
      hanViet: ["ngân", "hành"],
      flags: [{ kind: "han_viet_not_allowed", char: "行", am: "hang" }],
    });
    expect(applyHanViet(undefined, "行", table).hanViet).toEqual(["hành"]);
  });

  it("chữ một âm không theo AI, chữ ngoài bảng là null", () => {
    expect(applyHanViet(["sai", "sai"], "学校", table)).toEqual({
      hanViet: ["học", null],
      flags: [],
    });
  });
});

describe("hanVietRule", () => {
  it("chỉ nhờ AI chọn khi có chữ nhiều âm", () => {
    expect(hanVietRule("银行", table)).toContain("行: hành, hạnh, hàng");
    expect(hanVietRule("学", table)).toBe("han_viet = [] (máy tự điền).");
  });
});

describe("sentencePinyin", () => {
  const lexicon = parseLexicon(
    ["朋友\t朋友\tpeng2 you5\t1", "晚上\t晚上\twan3 shang5\t1", "电视\t電視\tdian4 shi4\t1"].join(
      "\n",
    ),
  );

  it("từ trong từ điển đúng thanh nhẹ, viết liền; dấu câu đổi sang dấu Latin", () => {
    expect(sentencePinyin("他是我的好朋友。", lexicon)).toBe("tā shì wǒ de hǎo péngyou.");
    expect(sentencePinyin("我晚上看电视，你呢？", lexicon)).toBe("wǒ wǎnshang kàn diànshì, nǐ ne?");
  });

  it("từ đang học lấy âm của nghĩa, kể cả khác âm thư viện đoán", () => {
    expect(sentencePinyin("请看门。", lexicon, { lemma: "看", pinyin: "kān" })).toBe(
      "qǐng kān mén.",
    );
  });

  it("giữ chữ số và chữ Latin", () => {
    expect(sentencePinyin("我买3个iPhone。", lexicon)).toBe("wǒ mǎi 3 gè iPhone.");
  });

  it("sentenceWords chỉ lấy cụm toàn chữ Hán, từ 2 chữ", () => {
    expect(sentenceWords(["好朋友。a"]).sort()).toEqual(["好朋", "好朋友", "朋友"].sort());
  });
});

describe("zhCardInfo", () => {
  const extra = {
    kind: "zh" as const,
    simplified: "银行",
    traditional: "銀行",
    pinyin: "yín háng",
    tones: [2, 2],
    hsk: 2,
    sense_pinyin: ["yín háng"],
    han_viet: ["ngân", "hàng"],
    example_pinyin: [["wǒ qù yínháng."]],
  };

  it("ghép âm Hán Việt theo chữ, âm các nghĩa giống nhau thì không hiện từng nghĩa", () => {
    expect(zhCardInfo({ lemma: "银行", language_extra: extra })).toEqual({
      pinyin: "yín háng",
      hanViet: [
        { char: "银", am: "ngân" },
        { char: "行", am: "hàng" },
      ],
      traditional: "銀行",
      hsk: 2,
      sensePinyin: null,
      examplePinyin: [["wǒ qù yínháng."]],
    });
  });

  it("phồn thể giống giản thể thì ẩn, các nghĩa đọc khác nhau thì hiện", () => {
    const info = zhCardInfo({
      lemma: "看",
      language_extra: {
        ...extra,
        simplified: "看",
        traditional: "看",
        sense_pinyin: ["kàn", "kān"],
      },
    });
    expect(info?.traditional).toBeNull();
    expect(info?.sensePinyin).toEqual(["kàn", "kān"]);
  });

  it("từ không phải tiếng Trung thì null", () => {
    expect(zhCardInfo({ lemma: "run", language_extra: null })).toBeNull();
  });
});

describe("splitHighlight với chữ Hán", () => {
  it("tô được từ nằm sát chữ khác", () => {
    expect(splitHighlight("我看电视", ["看"])).toEqual([
      { text: "我", hit: false },
      { text: "看", hit: true },
      { text: "电视", hit: false },
    ]);
  });

  it("tiếng Anh vẫn theo ranh giới từ", () => {
    expect(splitHighlight("start art", ["art"]).filter((s) => s.hit)).toHaveLength(1);
  });
});

describe("wordsByLanguage", () => {
  const words = [{ id: "en-word" }, { id: "zh-word" }];
  const entries = [
    { notebook_id: "en-book", user_word_id: "en-word" },
    { notebook_id: "zh-book", user_word_id: "zh-word" },
  ];

  it("tách từ theo ngôn ngữ của sổ, để số từ mới tính riêng", () => {
    const notebooks = [
      { id: "en-book", language: "en" },
      { id: "zh-book", language: "zh" },
    ];
    const groups = wordsByLanguage(words, notebooks, entries);
    expect(groups.get("en")).toEqual([{ id: "en-word" }]);
    expect(groups.get("zh")).toEqual([{ id: "zh-word" }]);
  });

  it("từ không nằm trong sổ nào coi như tiếng Anh", () => {
    expect(wordsByLanguage(words, [], []).get("en")).toEqual(words);
  });

  it("bỏ từ của ngôn ngữ chưa có phiên ôn", () => {
    const groups = wordsByLanguage(words, [{ id: "zh-book", language: "ja" }], entries);
    expect(groups.get("en")).toEqual([{ id: "en-word" }]);
    expect(groups.has("ja")).toBe(false);
  });
});

describe("pinyinOfSense", () => {
  const info = zhCardInfo({
    lemma: "看",
    language_extra: {
      kind: "zh",
      simplified: "看",
      traditional: "看",
      pinyin: "kàn",
      tones: [4],
      hsk: 1,
      sense_pinyin: ["kàn", "kān"],
    },
  })!;

  it("từ nhiều âm đọc theo nghĩa, thiếu thì dùng âm của từ", () => {
    expect(pinyinOfSense(info, 1)).toBe("kān");
    expect(pinyinOfSense(info, 5)).toBe("kàn");
  });
});
