/**
 * Phản hồi tập phát âm tiếng Trung (chốt Z4). Azure chỉ chấm được tới âm tiết và gần như bỏ qua thanh
 * điệu (docs/zh-spike.md §1), nên chỉ nói về phụ âm và vần: hiện 3 mức, không hiện số, vì điểm thất
 * thường với từ một âm tiết (giọng máy đọc đúng 汤 vẫn được 11/100). Lấy điểm độ chính xác, không lấy
 * điểm tổng: điểm tổng còn kéo theo độ trôi chảy nên dao động mạnh hơn. Hàm thuần.
 */
import type { PronunciationResult } from "./api";
import { MAX_TIPS, TIP_BELOW, scoreBand, type ScoreBand } from "./feedback";

export type ZhSyllable = {
  /** Chữ Hán của âm tiết; từ có âm cuốn (一点儿) thì số chữ khác số âm nên chỉ hiện pinyin. */
  text: string;
  pinyin: string;
  score: number;
  band: ScoreBand;
};

export function zhBand(result: PronunciationResult): ScoreBand {
  return scoreBand(result.accuracy);
}

/** Mỗi âm tiết kèm mức; số âm tiết Azure trả không khớp với pinyin thì null (chỉ hiện mức chung). */
export function zhSyllables(
  result: PronunciationResult,
  lemma: string,
  pinyin: string,
): ZhSyllable[] | null {
  // Azure tách âm cuốn (一点儿) thành "âm" r riêng, còn pinyin ghép vào âm trước (diǎnr).
  const scores = result.words.flatMap((word) =>
    word.phonemes.flatMap((phoneme) => (phoneme.ipa === "r" ? [] : [phoneme.score])),
  );
  const readings = pinyin.split(" ").filter(Boolean);
  if (scores.length === 0 || scores.length !== readings.length) return null;
  const chars = Array.from(lemma);
  return readings.map((reading, index) => ({
    text: chars.length === readings.length ? chars[index]! : reading,
    pinyin: reading,
    score: scores[index]!,
    band: scoreBand(scores[index]!),
  }));
}

export type ZhTipKey =
  "retroflex" | "r" | "palatal" | "dental" | "aspirated" | "unaspirated" | "umlaut" | "ng";

/** Bỏ dấu thanh, giữ ü. */
function plain(pinyin: string): string {
  return pinyin.normalize("NFD").replace(/[̄́̌̀]/gu, "").normalize("NFC").toLowerCase();
}

/** Mẹo cho một âm tiết: vần khó trước, rồi phụ âm đầu, cuối cùng là -ng. */
function tipOf(reading: string): ZhTipKey | null {
  const syllable = plain(reading);
  if (syllable.includes("ü") || /^(j|q|x|y)u/.test(syllable)) return "umlaut";
  if (/^(zh|ch|sh)/.test(syllable)) return "retroflex";
  if (syllable.startsWith("r")) return "r";
  if (/^[jqx]/.test(syllable)) return "palatal";
  if (/^[zcs]/.test(syllable)) return "dental";
  if (/^[ptk]/.test(syllable)) return "aspirated";
  if (/^[bdg]/.test(syllable)) return "unaspirated";
  return syllable.endsWith("ng") ? "ng" : null;
}

/** Tối đa 3 mẹo cho các âm tiết yếu, âm yếu nhất trước, mỗi loại một lần. */
export function zhTips(syllables: readonly ZhSyllable[]): { key: ZhTipKey; pinyin: string }[] {
  const tips: { key: ZhTipKey; pinyin: string }[] = [];
  const weak = syllables.filter((s) => s.score < TIP_BELOW).sort((a, b) => a.score - b.score);
  for (const { pinyin } of weak) {
    const key = tipOf(pinyin);
    if (key && !tips.some((tip) => tip.key === key)) tips.push({ key, pinyin });
    if (tips.length === MAX_TIPS) break;
  }
  return tips;
}
