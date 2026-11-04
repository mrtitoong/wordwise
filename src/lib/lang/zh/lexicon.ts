/**
 * Bảng âm đọc lấy từ CC-CEDICT (data/zh/lexicon.tsv): chỉ pinyin và dạng giản/phồn thể, không có
 * định nghĩa (docs/plan-zh.md §3 điểm 3). AI chọn âm trong bảng này, không tự viết pinyin.
 */
import { numberedToMarked, pinyinKey, tonesOf } from "./pinyin";

export type Reading = {
  traditional: string;
  /** Pinyin có dấu. */
  pinyin: string;
  tones: number[];
  /** false: chỉ là họ, biến thể, âm cổ hoặc âm chỉ dùng trong từ khác. */
  common: boolean;
};

export type Lexicon = ReadonlyMap<string, readonly Reading[]>;

/** Một dòng của bảng zh_lexicon (pinyin dạng số) thành âm đọc. */
export function toReading(row: { traditional: string; pinyin: string; common: boolean }): Reading {
  return {
    traditional: row.traditional,
    pinyin: numberedToMarked(row.pinyin),
    tones: tonesOf(row.pinyin),
    common: row.common,
  };
}

export function parseLexicon(tsv: string): Lexicon {
  const lexicon = new Map<string, Reading[]>();
  for (const line of tsv.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [simplified, traditional, pinyin, common] = line.split("\t");
    if (!simplified || !traditional || !pinyin) continue;
    const list = lexicon.get(simplified) ?? [];
    list.push(toReading({ traditional, pinyin, common: common === "1" }));
    lexicon.set(simplified, list);
  }
  return lexicon;
}

/** Âm được phép chọn: âm thông dụng trước, không có thì mọi âm; trùng cách đọc chỉ giữ một. */
export function allowedReadings(readings: readonly Reading[] = []): Reading[] {
  const common = readings.filter((r) => r.common);
  const seen = new Set<string>();
  return (common.length > 0 ? common : readings).filter((r) => {
    const key = pinyinKey(r.pinyin);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type LexiconFlag =
  | { kind: "not_in_dictionary" }
  /** Nghĩa thứ `sense` có âm AI viết ngoài các âm được phép. */
  | { kind: "reading_not_allowed"; sense: number; pinyin: string };

type Draft = {
  language_extra: {
    traditional: string | null;
    pinyin: string;
    tones: number[];
    sense_pinyin?: string[] | undefined;
    reading_source?: "dictionary" | "ai" | undefined;
  };
};

/**
 * Thay pinyin, thanh điệu, phồn thể bằng số liệu từ điển. Âm AI chọn ngoài danh sách thì giữ
 * nguyên và báo cờ cho người duyệt; từ không có trong từ điển cũng báo cờ.
 */
export function applyLexicon<T extends Draft>(
  draft: T,
  readings: readonly Reading[] | undefined,
): { content: T; flags: LexiconFlag[] } {
  const allowed = allowedReadings(readings);
  const extra = draft.language_extra;
  if (allowed.length === 0) {
    return {
      content: { ...draft, language_extra: { ...extra, reading_source: "ai" } },
      flags: [{ kind: "not_in_dictionary" }],
    };
  }

  const flags: LexiconFlag[] = [];
  const senses = extra.sense_pinyin ?? [];
  const chosen = senses.map((pinyin, sense) => {
    if (allowed.length === 1) return allowed[0]!;
    const match = allowed.find((r) => pinyinKey(r.pinyin) === pinyinKey(pinyin));
    if (!match) flags.push({ kind: "reading_not_allowed", sense, pinyin });
    return match ?? null;
  });
  const first = chosen[0];
  return {
    content: {
      ...draft,
      language_extra: {
        ...extra,
        traditional: (first ?? allowed[0]!).traditional,
        pinyin: first?.pinyin ?? extra.pinyin,
        tones: first?.tones ?? extra.tones,
        sense_pinyin: chosen.map((r, i) => r?.pinyin ?? senses[i]!),
        reading_source: flags.length > 0 ? "ai" : "dictionary",
      },
    },
    flags,
  };
}
