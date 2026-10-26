/**
 * Kiểm tra đầu vào khi thêm danh sách Thư viện (Prompt 7.4b): lấy mẫu 30 từ trải đều độ khó, hỏi
 * Biết / Không chắc / Chưa biết (+ 1 câu trắc nghiệm cho "Biết"), rồi suy ra từ đã biết. Hàm thuần.
 *
 * Chốt với chủ sản phẩm: chia từ có độ khó thành 5 nhóm từ dễ đến khó, mỗi nhóm hỏi 6 từ; nhóm có
 * ≥ 80% từ mẫu được tính là biết thì đề xuất cả nhóm là đã biết. Từ không có thứ hạng tần suất lẫn
 * CEFR thì không suy ra. Mặc định nhận hết đề xuất, người học xem lại theo nhóm nếu muốn.
 */
import { LIST_CEFR } from "@/lib/admin/lists";

/** Số từ hỏi tối đa. */
export const PLACEMENT_SAMPLE = 30;
/** Số nhóm độ khó. */
export const PLACEMENT_BANDS = 5;
/** Tỉ lệ biết trong mẫu của một nhóm để đề xuất cả nhóm là đã biết. */
export const KNOWN_RATIO = 0.8;
/** Nhóm cần ít nhất chừng này câu đã trả lời mới suy ra (kết thúc sớm). */
export const MIN_BAND_ANSWERS = 3;
/** Ít hơn chừng này từ chưa học thì không mời làm kiểm tra. */
export const MIN_PLACEMENT_WORDS = 10;

/** Thứ hạng ước theo CEFR cho từ không có thứ hạng tần suất. */
const CEFR_RANK: Record<(typeof LIST_CEFR)[number], number> = {
  A1: 500,
  A2: 1_500,
  B1: 3_000,
  B2: 5_000,
  C1: 8_000,
  C2: 12_000,
};

export type PlacementWord = {
  senseId: string;
  frequencyRank: number | null;
  cefr: string | null;
};

/** Độ khó (nhỏ = dễ, thông dụng): thứ hạng tần suất, không có thì ước theo CEFR, không có nữa thì null. */
export function difficultyOf(word: Pick<PlacementWord, "frequencyRank" | "cefr">): number | null {
  if (word.frequencyRank && word.frequencyRank > 0) return word.frequencyRank;
  const cefr = word.cefr?.toUpperCase() as keyof typeof CEFR_RANK | undefined;
  return cefr && cefr in CEFR_RANK ? CEFR_RANK[cefr] : null;
}

export type PlacementPlan = {
  /** Nghĩa cần hỏi, đã xáo thứ tự. */
  sample: string[];
  /** Nhóm độ khó (từ dễ đến khó), mỗi nhóm là danh sách nghĩa theo độ khó. */
  bands: string[][];
  /** Từ không có độ khó: không suy ra được. */
  unrated: string[];
};

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Chia `items` thành `count` nhóm liền nhau, kích thước chênh nhau tối đa 1. */
function split<T>(items: readonly T[], count: number): T[][] {
  const out: T[][] = [];
  let from = 0;
  for (let i = 0; i < count; i++) {
    const size = Math.floor(items.length / count) + (i < items.length % count ? 1 : 0);
    if (size > 0) out.push(items.slice(from, from + size));
    from += size;
  }
  return out;
}

/**
 * Chọn từ để hỏi trong các từ chưa học. Không quá 30 từ thì hỏi hết. Nhiều hơn: chia từ có độ khó
 * thành 5 nhóm, mỗi nhóm hỏi 6 từ ngẫu nhiên; thiếu từ có độ khó thì lấy thêm từ không có độ khó.
 */
export function planPlacement(
  words: readonly PlacementWord[],
  random: () => number = Math.random,
): PlacementPlan {
  const seen = new Set<string>();
  const unique = words.filter((w) => !seen.has(w.senseId) && seen.add(w.senseId));
  const rated = unique
    .map((w, i) => ({ id: w.senseId, difficulty: difficultyOf(w), i }))
    .filter((w): w is { id: string; difficulty: number; i: number } => w.difficulty !== null)
    .sort((a, b) => a.difficulty - b.difficulty || a.i - b.i)
    .map((w) => w.id);
  const ratedSet = new Set(rated);
  const unrated = unique.map((w) => w.senseId).filter((id) => !ratedSet.has(id));
  const bands = split(rated, PLACEMENT_BANDS);

  if (unique.length <= PLACEMENT_SAMPLE) {
    return { sample: shuffle([...rated, ...unrated], random), bands, unrated };
  }
  const perBand = Math.floor(PLACEMENT_SAMPLE / PLACEMENT_BANDS);
  const picked = bands.flatMap((band) => shuffle(band, random).slice(0, perBand));
  const pickedSet = new Set(picked);
  const rest = shuffle([...rated.filter((id) => !pickedSet.has(id)), ...unrated], random).slice(
    0,
    PLACEMENT_SAMPLE - picked.length,
  );
  return { sample: shuffle([...picked, ...rest], random), bands, unrated };
}

/** "Biết" chỉ tính khi trả lời đúng câu trắc nghiệm (hoặc không tạo được câu trắc nghiệm). */
export type PlacementAnswer = "known" | "unsure" | "unknown";

export type PlacementGroup = {
  /** Thứ tự nhóm độ khó (0 = dễ nhất). */
  band: number;
  /** Nghĩa đề xuất là đã biết: từ mẫu đã biết + (nếu nhóm đạt ngưỡng) từ chưa hỏi của nhóm. */
  senseIds: string[];
  /** Nhóm đạt ngưỡng, đề xuất cả nhóm. */
  inferred: boolean;
};

export type PlacementResult = {
  /** Số câu đã trả lời. */
  answered: number;
  /** Ước tính phần trăm từ đã biết (0–100) theo tỉ lệ biết của mẫu từng nhóm. */
  estimate: number;
  /** Nhóm có từ đề xuất là đã biết (theo thứ tự độ khó; nhóm "khác" cho từ không có độ khó). */
  groups: PlacementGroup[];
};

/** Nhóm của từ không có độ khó (chỉ chứa từ mẫu đã biết). */
export const UNRATED_BAND = -1;

/** Suy ra từ đã biết từ câu trả lời (có thể chưa trả lời hết: kết thúc sớm). */
export function inferKnown(
  plan: PlacementPlan,
  answers: ReadonlyMap<string, PlacementAnswer>,
): PlacementResult {
  const isKnown = (id: string) => answers.get(id) === "known";
  const groups: PlacementGroup[] = [];
  let estimated = 0;
  let total = 0;
  let answeredKnown = 0;
  let answeredCount = 0;

  plan.bands.forEach((band, index) => {
    const asked = band.filter((id) => answers.has(id));
    const known = asked.filter(isKnown);
    answeredKnown += known.length;
    answeredCount += asked.length;
    const inferred = asked.length >= MIN_BAND_ANSWERS && known.length / asked.length >= KNOWN_RATIO;
    const ratio = asked.length > 0 ? known.length / asked.length : 0;
    // Ước tính: từ đã hỏi tính đúng như trả lời, từ chưa hỏi theo tỉ lệ của nhóm.
    estimated += known.length + (band.length - asked.length) * ratio;
    total += band.length;
    const senseIds = inferred ? band.filter((id) => !answers.has(id) || isKnown(id)) : known;
    if (senseIds.length > 0) groups.push({ band: index, senseIds, inferred });
  });

  const unratedAsked = plan.unrated.filter((id) => answers.has(id));
  const unratedKnown = unratedAsked.filter(isKnown);
  answeredKnown += unratedKnown.length;
  answeredCount += unratedAsked.length;
  // Từ không có độ khó chưa hỏi: ước theo tỉ lệ chung của mẫu.
  const overall = answeredCount > 0 ? answeredKnown / answeredCount : 0;
  estimated += unratedKnown.length + (plan.unrated.length - unratedAsked.length) * overall;
  total += plan.unrated.length;
  if (unratedKnown.length > 0) {
    groups.push({ band: UNRATED_BAND, senseIds: unratedKnown, inferred: false });
  }

  return {
    answered: answeredCount,
    estimate: total > 0 ? Math.round((estimated / total) * 100) : 0,
    groups,
  };
}

/** Mọi nghĩa đề xuất là đã biết. */
export function proposedKnown(result: PlacementResult): string[] {
  return result.groups.flatMap((g) => g.senseIds);
}
