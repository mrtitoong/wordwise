/**
 * 50 từ để so sánh model tiếng Trung: trải đều HSK 1–3, gồm từ nhiều âm, lượng từ, trợ từ, số từ, từ
 * ghép có thanh nhẹ (phần tiếng Trung khó và khác tiếng Anh).
 */
export interface ZhCompareWord {
  lemma: string;
  pos: string;
  hsk: 1 | 2 | 3;
  note?: string;
}

const POLY = "nhiều âm cùng loại từ";

export const ZH_COMPARE_WORDS: ZhCompareWord[] = [
  { lemma: "看", pos: "verb", hsk: 1, note: POLY },
  { lemma: "好", pos: "adjective", hsk: 1, note: "hǎo/hào khác loại từ" },
  { lemma: "的", pos: "particle", hsk: 1, note: "trợ từ" },
  { lemma: "了", pos: "particle", hsk: 1, note: "trợ từ, le/liǎo" },
  { lemma: "吗", pos: "particle", hsk: 1, note: "trợ từ" },
  { lemma: "个", pos: "classifier", hsk: 1, note: "lượng từ" },
  { lemma: "本", pos: "classifier", hsk: 1, note: "lượng từ" },
  { lemma: "二", pos: "numeral", hsk: 1, note: "số từ, phân biệt 两" },
  { lemma: "你", pos: "pronoun", hsk: 1 },
  { lemma: "和", pos: "conjunction", hsk: 1, note: "nhiều âm" },
  { lemma: "在", pos: "preposition", hsk: 1 },
  { lemma: "吃", pos: "verb", hsk: 1 },
  { lemma: "学校", pos: "noun", hsk: 1 },
  { lemma: "老师", pos: "noun", hsk: 1 },
  { lemma: "朋友", pos: "noun", hsk: 1, note: "thanh nhẹ" },
  { lemma: "多少", pos: "pronoun", hsk: 1, note: "thanh nhẹ" },
  { lemma: "东西", pos: "noun", hsk: 1, note: "dōngxi/dōngxī" },
  { lemma: "还", pos: "adverb", hsk: 1, note: "hái/huán khác loại từ" },
  { lemma: "倒", pos: "verb", hsk: 2, note: POLY },
  { lemma: "背", pos: "verb", hsk: 2, note: POLY },
  { lemma: "长", pos: "adjective", hsk: 2, note: "cháng/zhǎng khác loại từ" },
  { lemma: "得", pos: "particle", hsk: 2, note: "de/dé/děi" },
  { lemma: "地方", pos: "noun", hsk: 1, note: "thanh nhẹ, đổi nghĩa" },
  { lemma: "便宜", pos: "adjective", hsk: 2, note: "piányi/biànyí" },
  { lemma: "故事", pos: "noun", hsk: 2, note: "thanh nhẹ" },
  { lemma: "教", pos: "verb", hsk: 1, note: "jiāo/jiào" },
  { lemma: "当", pos: "verb", hsk: 2, note: POLY },
  { lemma: "因为", pos: "conjunction", hsk: 2 },
  { lemma: "比较", pos: "adverb", hsk: 3 },
  { lemma: "辆", pos: "classifier", hsk: 2, note: "lượng từ" },
  { lemma: "着", pos: "particle", hsk: 1, note: "zhe/zháo/zhuó" },
  { lemma: "参加", pos: "verb", hsk: 2 },
  { lemma: "漂亮", pos: "adjective", hsk: 2 },
  { lemma: "调", pos: "verb", hsk: 3, note: POLY },
  { lemma: "转", pos: "verb", hsk: 3, note: POLY },
  { lemma: "空", pos: "adjective", hsk: 3, note: "kōng/kòng" },
  { lemma: "种", pos: "classifier", hsk: 3, note: "zhǒng/zhòng khác loại từ" },
  { lemma: "精神", pos: "noun", hsk: 3, note: "jīngshén/jīngshen" },
  { lemma: "生意", pos: "noun", hsk: 3, note: "thanh nhẹ" },
  { lemma: "结实", pos: "adjective", hsk: 3, note: "thanh nhẹ" },
  { lemma: "尽量", pos: "adverb", hsk: 3, note: "jǐn/jìn" },
  { lemma: "重点", pos: "noun", hsk: 2, note: "zhòng/chóng" },
  { lemma: "经验", pos: "noun", hsk: 3 },
  { lemma: "解决", pos: "verb", hsk: 3 },
  { lemma: "认真", pos: "adjective", hsk: 1 },
  { lemma: "一定", pos: "adverb", hsk: 2, note: "biến điệu 一" },
  { lemma: "差", pos: "adjective", hsk: 1, note: "chà/chā/chāi" },
  { lemma: "少", pos: "adjective", hsk: 1, note: "shǎo/shào" },
  { lemma: "车上", pos: "noun", hsk: 1, note: "không có trong CC-CEDICT" },
  { lemma: "不太", pos: "adverb", hsk: 2, note: "không có trong CC-CEDICT, biến điệu 不" },
];
