/**
 * Phản hồi sau khi chấm phát âm (Prompt 5.3): mức điểm (màu + ký hiệu, không chỉ dựa vào màu) và
 * mẹo sửa âm cho người Việt theo quy tắc (không dùng AI). Hàm thuần.
 */
import type { PronunciationResult } from "./api";

export type ScoreBand = "good" | "fair" | "poor";

/** Xanh ≥ 80, vàng 60–79, đỏ < 60 (docs/prompts.md Prompt 5.3). */
export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

/** Ký hiệu kèm màu (người khó phân biệt màu vẫn đọc được). */
export const BAND_SYMBOL: Record<ScoreBand, string> = { good: "✓", fair: "~", poor: "✗" };

/** Âm dưới mức này thì có mẹo. */
export const TIP_BELOW = 70;
export const MAX_TIPS = 3;

/** Mẹo cho các âm người Việt hay sai. Khóa là mã mẹo (tên trong file dịch review.tips.*). */
export type TipKey =
  | "th_voiceless"
  | "th_voiced"
  | "final_s"
  | "final_z"
  | "final_t_d"
  | "final_k_g"
  | "final_other"
  | "sh_s"
  | "zh"
  | "ch_j"
  | "l_n"
  | "r"
  | "v"
  | "long_vowel"
  | "ae"
  | "schwa";

const FINAL_TIPS: Record<string, TipKey> = {
  s: "final_s",
  z: "final_z",
  t: "final_t_d",
  d: "final_t_d",
  k: "final_k_g",
  ɡ: "final_k_g",
  g: "final_k_g",
};

const PHONEME_TIPS: Record<string, TipKey> = {
  θ: "th_voiceless",
  ð: "th_voiced",
  ʃ: "sh_s",
  ʒ: "zh",
  tʃ: "ch_j",
  dʒ: "ch_j",
  l: "l_n",
  n: "l_n",
  r: "r",
  ɹ: "r",
  v: "v",
  æ: "ae",
  ə: "schwa",
  iː: "long_vowel",
  uː: "long_vowel",
  ɑː: "long_vowel",
  ɔː: "long_vowel",
  ɜː: "long_vowel",
};

/** Ở cuối từ vẫn dùng mẹo riêng của âm (không phải mẹo "đừng nuốt âm cuối"). */
const FINAL_KEEPS_OWN_TIP = new Set(["θ", "ð", "ʃ", "ʒ", "tʃ", "dʒ", "v"]);

export type Tip = { key: TipKey; phoneme: string; word: string };

/** Âm cuối của từ là phụ âm (người Việt hay nuốt âm cuối). */
const CONSONANT = /^(?!.*[aeiouæɑɒɔəɛɜɪʊʌ])/u;

/**
 * Tối đa 3 mẹo cho các âm điểm thấp (< 70), âm thấp nhất trước, mỗi loại mẹo một lần. Âm cuối là
 * phụ âm thì dùng mẹo "đừng nuốt âm cuối". Giọng Anh (không có tên âm vị) thì không có mẹo.
 */
export function pronunciationTips(result: PronunciationResult): Tip[] {
  const weak = result.words.flatMap((word) =>
    word.phonemes.flatMap((phoneme, index) => {
      if (!phoneme.ipa || phoneme.score >= TIP_BELOW) return [];
      const ipa = phoneme.ipa.replace(/[ˈˌ.]/gu, "");
      const last = index === word.phonemes.length - 1;
      // Âm cuối: mẹo riêng của âm đó (θ, ʃ, v…) nếu có, còn lại (kể cả l, n, r) là "đừng nuốt âm".
      const key =
        last && CONSONANT.test(ipa)
          ? (FINAL_TIPS[ipa] ??
            (FINAL_KEEPS_OWN_TIP.has(ipa) ? PHONEME_TIPS[ipa] : undefined) ??
            "final_other")
          : PHONEME_TIPS[ipa];
      return key ? [{ key, phoneme: ipa, word: word.word, score: phoneme.score }] : [];
    }),
  );
  weak.sort((a, b) => a.score - b.score);
  const seen = new Set<TipKey>();
  const tips: Tip[] = [];
  for (const { key, phoneme, word } of weak) {
    if (seen.has(key)) continue;
    seen.add(key);
    tips.push({ key, phoneme, word });
    if (tips.length === MAX_TIPS) break;
  }
  return tips;
}

/** Có chi tiết từng âm (giọng Mỹ) hay chỉ có điểm từ (giọng Anh). */
export function hasPhonemeNames(result: PronunciationResult): boolean {
  return result.words.some((w) => w.phonemes.some((p) => p.ipa));
}
