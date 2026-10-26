import { describe, expect, it } from "vitest";
import {
  KNOWN_RATIO,
  PLACEMENT_SAMPLE,
  UNRATED_BAND,
  difficultyOf,
  inferKnown,
  planPlacement,
  proposedKnown,
  type PlacementAnswer,
  type PlacementWord,
} from "./placement";

/** Bộ sinh số ngẫu nhiên cố định (LCG) để test lặp lại được. */
function seeded(seed = 42) {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

/** n từ có thứ hạng 1..n (từ "w1" dễ nhất). */
const ranked = (n: number, from = 1): PlacementWord[] =>
  Array.from({ length: n }, (_, i) => ({
    senseId: `w${from + i}`,
    frequencyRank: from + i,
    cefr: null,
  }));

const answerAll = (ids: readonly string[], value: (id: string) => PlacementAnswer) =>
  new Map(ids.map((id) => [id, value(id)]));

describe("difficultyOf", () => {
  it("ưu tiên thứ hạng tần suất, không có thì ước theo CEFR", () => {
    expect(difficultyOf({ frequencyRank: 1200, cefr: "C2" })).toBe(1200);
    expect(difficultyOf({ frequencyRank: null, cefr: "a2" })).toBe(1500);
    expect(difficultyOf({ frequencyRank: null, cefr: "C1" })).toBeGreaterThan(
      difficultyOf({ frequencyRank: null, cefr: "B2" })!,
    );
    expect(difficultyOf({ frequencyRank: null, cefr: null })).toBeNull();
    expect(difficultyOf({ frequencyRank: 0, cefr: "X" })).toBeNull();
  });
});

describe("planPlacement", () => {
  it("danh sách ≤ 30 từ thì hỏi hết", () => {
    const words = [...ranked(20), { senseId: "u1", frequencyRank: null, cefr: null }];
    const plan = planPlacement(words, seeded());
    expect([...plan.sample].sort()).toEqual(words.map((w) => w.senseId).sort());
    expect(plan.unrated).toEqual(["u1"]);
  });

  it("danh sách lớn: 30 từ, mỗi nhóm độ khó 6 từ, không trùng", () => {
    const plan = planPlacement(ranked(500), seeded());
    expect(plan.sample).toHaveLength(PLACEMENT_SAMPLE);
    expect(new Set(plan.sample).size).toBe(PLACEMENT_SAMPLE);
    expect(plan.bands).toHaveLength(5);
    expect(plan.bands.map((b) => b.length)).toEqual([100, 100, 100, 100, 100]);
    // Nhóm 0 là 100 từ dễ nhất.
    expect(plan.bands[0]![0]).toBe("w1");
    expect(plan.bands[4]!.at(-1)).toBe("w500");
    for (const band of plan.bands) {
      expect(plan.sample.filter((id) => band.includes(id))).toHaveLength(6);
    }
  });

  it("xếp nhóm theo độ khó chứ không theo thứ tự danh sách; bỏ nghĩa trùng", () => {
    const words = ranked(100).reverse();
    const plan = planPlacement([...words, words[0]!], seeded());
    expect(plan.bands[0]).toContain("w1");
    expect(plan.bands[0]).not.toContain("w100");
    expect(plan.bands.flat()).toHaveLength(100);
  });

  it("ít từ có độ khó: lấy thêm từ không có độ khó cho đủ 30", () => {
    const unrated = Array.from({ length: 50 }, (_, i) => ({
      senseId: `u${i}`,
      frequencyRank: null,
      cefr: null,
    }));
    const plan = planPlacement([...ranked(10), ...unrated], seeded());
    expect(plan.sample).toHaveLength(PLACEMENT_SAMPLE);
    expect(plan.sample.filter((id) => id.startsWith("w"))).toHaveLength(10);
    expect(plan.unrated).toHaveLength(50);
  });

  it("cùng hạt giống cho cùng kết quả", () => {
    expect(planPlacement(ranked(200), seeded(7))).toEqual(planPlacement(ranked(200), seeded(7)));
  });
});

describe("inferKnown", () => {
  it("người học chưa biết gì: không đề xuất từ nào", () => {
    const plan = planPlacement(ranked(300), seeded());
    const result = inferKnown(
      plan,
      answerAll(plan.sample, () => "unknown"),
    );
    expect(result.answered).toBe(30);
    expect(result.estimate).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it("nhóm ≥ 80% biết thì đề xuất cả nhóm; nhóm khác chỉ giữ từ mẫu đã biết", () => {
    const plan = planPlacement(ranked(500), seeded());
    const band = (id: string) => plan.bands.findIndex((b) => b.includes(id));
    const result = inferKnown(
      plan,
      // Nhóm 0, 1 biết hết; nhóm 2 biết 1/6; nhóm 3, 4 không biết.
      answerAll(plan.sample, (id) => {
        const b = band(id);
        if (b <= 1) return "known";
        if (b === 2)
          return plan.bands[2]!.filter((x) => plan.sample.includes(x))[0] === id
            ? "known"
            : "unsure";
        return "unknown";
      }),
    );
    expect(result.groups.map((g) => [g.band, g.inferred, g.senseIds.length])).toEqual([
      [0, true, 100],
      [1, true, 100],
      [2, false, 1],
    ]);
    expect(proposedKnown(result)).toHaveLength(201);
    // (100 + 100 + 1/6 × 100) / 500 ≈ 43%.
    expect(result.estimate).toBe(43);
  });

  it("ngưỡng 80%: 5/6 đạt, 4/6 không đạt; từ mẫu trả lời sai không bị đề xuất", () => {
    expect(5 / 6).toBeGreaterThanOrEqual(KNOWN_RATIO);
    expect(4 / 6).toBeLessThan(KNOWN_RATIO);
    const plan = planPlacement(ranked(100), seeded());
    const asked = plan.bands[0]!.filter((id) => plan.sample.includes(id));
    const five = inferKnown(
      plan,
      answerAll(asked, (id) => (id === asked[0] ? "unsure" : "known")),
    );
    expect(five.groups[0]).toMatchObject({ band: 0, inferred: true });
    expect(five.groups[0]!.senseIds).not.toContain(asked[0]);
    expect(five.groups[0]!.senseIds).toHaveLength(20 - 1);

    const four = inferKnown(
      plan,
      answerAll(asked, (id) => (asked.indexOf(id) < 2 ? "unknown" : "known")),
    );
    expect(four.groups[0]).toMatchObject({ band: 0, inferred: false });
    expect(four.groups[0]!.senseIds).toHaveLength(4);
  });

  it("kết thúc sớm: nhóm có dưới 3 câu trả lời thì không suy ra", () => {
    const plan = planPlacement(ranked(100), seeded());
    const asked = plan.bands[0]!.filter((id) => plan.sample.includes(id)).slice(0, 2);
    const result = inferKnown(
      plan,
      answerAll(asked, () => "known"),
    );
    expect(result.answered).toBe(2);
    expect(result.groups).toEqual([{ band: 0, senseIds: asked, inferred: false }]);
  });

  it("danh sách nhỏ hỏi hết: đề xuất đúng các từ trả lời biết", () => {
    const words = [...ranked(12), { senseId: "u1", frequencyRank: null, cefr: null }];
    const plan = planPlacement(words, seeded());
    const knownIds = new Set(["w1", "w2", "w3", "u1"]);
    const result = inferKnown(
      plan,
      answerAll(plan.sample, (id) => (knownIds.has(id) ? "known" : "unknown")),
    );
    expect(new Set(proposedKnown(result))).toEqual(knownIds);
    expect(result.groups.at(-1)).toEqual({ band: UNRATED_BAND, senseIds: ["u1"], inferred: false });
    expect(result.estimate).toBe(Math.round((4 / 13) * 100));
  });

  it("từ không có độ khó chưa hỏi: ước tính theo tỉ lệ chung, không đề xuất", () => {
    const unrated = Array.from({ length: 70 }, (_, i) => ({
      senseId: `u${i}`,
      frequencyRank: null,
      cefr: null,
    }));
    const plan = planPlacement([...ranked(30), ...unrated], seeded());
    const result = inferKnown(
      plan,
      answerAll(plan.sample, () => "known"),
    );
    expect(result.estimate).toBe(100);
    const suggested = proposedKnown(result);
    // Từ có độ khó: cả nhóm; từ không có độ khó: chỉ từ đã hỏi.
    expect(suggested.filter((id) => id.startsWith("w"))).toHaveLength(30);
    expect(suggested.filter((id) => id.startsWith("u"))).toEqual(
      plan.sample.filter((id) => id.startsWith("u")),
    );
  });
});
