import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitHighlight } from "@/lib/words/highlight";
import { wordsByLanguage } from "../filter";
import { pinyinOfSense, zhCardInfo } from "./card";
import { spokenPinyin } from "./pinyin";
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

describe("sentencePinyin: âm đọc thật", () => {
  const full = parseLexicon(readFileSync("data/zh/lexicon.tsv", "utf8"));

  it("一 và 不 ghi đúng âm đọc, không phụ thuộc nguồn âm", () => {
    expect(sentencePinyin("我有一个姐姐。", full)).toContain("yíge");
    expect(sentencePinyin("这里有一张床。", full)).toContain("yì zhāng");
    expect(sentencePinyin("我们一起去。", full)).toContain("yìqǐ");
    expect(sentencePinyin("这个不对。", full)).toContain("búduì");
    expect(sentencePinyin("我不好。", full)).toContain("bùhǎo");
  });

  it("từ đang học có 一 cũng đổi âm", () => {
    expect(sentencePinyin("我们一起去。", full, { lemma: "一起", pinyin: "yī qǐ" })).toContain(
      "yìqǐ",
    );
  });

  it("chỗ không đổi âm thì giữ nguyên", () => {
    expect(sentencePinyin("他是第一。", full)).toContain("yī");
    expect(sentencePinyin("今天星期一。", full)).toContain("yī");
    expect(sentencePinyin("你看一看。", full)).toContain("yi");
    expect(sentencePinyin("对不起。", full)).toContain("bu");
  });

  it("了 sau động từ là trợ từ le, 了解 vẫn là liǎo", () => {
    expect(sentencePinyin("我们到了。", full)).not.toContain("liǎo");
    expect(sentencePinyin("我了解他。", full)).toContain("liǎo");
  });

  it("giữ thanh nhẹ của từ đứng sau", () => {
    expect(sentencePinyin("我哥哥在家。", full)).toContain("gēge");
    expect(sentencePinyin("我哥哥在家。", full, { lemma: "哥", pinyin: "gē" })).toContain("gēge");
    expect(sentencePinyin("我听清楚了。", full)).toContain("qīngchu");
    expect(sentencePinyin("他穿衣服。", full)).toContain("yīfu");
  });

  it("không ghép nhầm với trợ từ, 不是 giữ thanh 4", () => {
    expect(sentencePinyin("这个国家的人。", full)).toContain("guójiā");
    expect(sentencePinyin("这不是我的。", full)).toContain("búshì");
    expect(sentencePinyin("我们趁早上车。", full)).toContain("chènzǎo");
    expect(sentencePinyin("请把手洗干净。", full)).not.toContain("shou ");
    expect(sentencePinyin("我不会说法语。", full)).not.toContain("shuōfa");
    expect(sentencePinyin("写一下作业。", full)).toContain("zuòyè");
  });

  it("东西, 地方 đọc thanh nhẹ", () => {
    expect(sentencePinyin("这个东西很好。", full)).toContain("dōngxi");
    expect(sentencePinyin("这个地方很好。", full)).toContain("dìfang");
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

describe("spokenPinyin", () => {
  it("一 đổi thanh theo âm đứng sau", () => {
    expect(spokenPinyin("一起", "yī qǐ")).toBe("yì qǐ");
    expect(spokenPinyin("一些", "yī xiē")).toBe("yì xiē");
    expect(spokenPinyin("一样", "yī yàng")).toBe("yí yàng");
    expect(spokenPinyin("一点儿", "yī diǎnr")).toBe("yì diǎnr");
    expect(spokenPinyin("一个", "yī ge")).toBe("yí ge");
    expect(spokenPinyin("有一些", "yǒu yī xiē")).toBe("yǒu yì xiē");
  });

  it("不 chỉ đổi trước thanh 4", () => {
    expect(spokenPinyin("不对", "bù duì")).toBe("bú duì");
    expect(spokenPinyin("不客气", "bù kè qi")).toBe("bú kè qi");
    expect(spokenPinyin("不好", "bù hǎo")).toBe("bù hǎo");
  });

  it("giữ nguyên khi không đổi thanh", () => {
    expect(spokenPinyin("一", "yī")).toBe("yī");
    expect(spokenPinyin("不", "bù")).toBe("bù");
    expect(spokenPinyin("第一", "dì yī")).toBe("dì yī");
    expect(spokenPinyin("第一次", "dì yī cì")).toBe("dì yī cì");
    expect(spokenPinyin("星期一", "xīng qī yī")).toBe("xīng qī yī");
    expect(spokenPinyin("统一", "tǒng yī")).toBe("tǒng yī");
    expect(spokenPinyin("一月", "yī yuè")).toBe("yī yuè");
    expect(spokenPinyin("十一月", "shí yī yuè")).toBe("shí yī yuè");
    expect(spokenPinyin("对不起", "duì bu qǐ")).toBe("duì bu qǐ");
    expect(spokenPinyin("一等奖", "yī děng jiǎng")).toBe("yī děng jiǎng");
    expect(spokenPinyin("统一性", "tǒng yī xìng")).toBe("tǒng yī xìng");
    expect(spokenPinyin("等一等", "děng yī děng")).toBe("děng yi děng");
    expect(spokenPinyin("学校", "xué xiào")).toBe("xué xiào");
  });

  it("thẻ từ hiện âm đọc, dữ liệu gốc không đổi", () => {
    const extra = {
      kind: "zh" as const,
      simplified: "一起",
      traditional: "一起",
      pinyin: "yī qǐ",
      tones: [1, 3],
      hsk: 1,
      sense_pinyin: ["yī qǐ"],
    };
    expect(zhCardInfo({ lemma: "一起", language_extra: extra })!.pinyin).toBe("yì qǐ");
    expect(extra.pinyin).toBe("yī qǐ");
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
