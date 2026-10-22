import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/srs/simulate";
import {
  assemble,
  clozeOf,
  maskedPositions,
  maxRatingFor,
  nextTileIndex,
  patternOf,
  promptKind,
  scrambleTiles,
  slotsOf,
  startLevel,
} from "./writing";

const sorted = (list: readonly string[]) => [...list].sort().join("");

describe("startLevel, maxRatingFor, promptKind", () => {
  it("mức 0–1: ngẫu nhiên xếp chữ hoặc điền chữ thiếu; mức 2: chữ đầu; mức 3–4: ô trống", () => {
    expect(startLevel(0, () => 0.1)).toBe(1);
    expect(startLevel(1, () => 0.9)).toBe(2);
    expect(startLevel(2)).toBe(3);
    expect(startLevel(3)).toBe(4);
    expect(startLevel(4)).toBe(4);
    const random = seededRandom(7);
    const levels = Array.from({ length: 200 }, () => startLevel(1, random));
    const ones = levels.filter((l) => l === 1).length;
    expect(ones).toBeGreaterThan(70);
    expect(ones).toBeLessThan(130);
  });

  it("cấp 1–2 đúng tối đa Nhớ; cấp 3–4 không giới hạn", () => {
    expect(maxRatingFor(1)).toBe(Rating.Good);
    expect(maxRatingFor(2)).toBe(Rating.Good);
    expect(maxRatingFor(3)).toBeUndefined();
    expect(maxRatingFor(4)).toBeUndefined();
  });

  it("câu khuyết từ chỉ khi có câu và thẻ từ mức 2", () => {
    expect(promptKind(1, true, () => 0)).toBe("meaning");
    expect(promptKind(2, false, () => 0)).toBe("meaning");
    expect(promptKind(2, true, () => 0.2)).toBe("cloze");
    expect(promptKind(3, true, () => 0.8)).toBe("meaning");
  });
});

describe("xếp chữ (cấp 1)", () => {
  it("ô chữ là các chữ cái của đáp án, xáo khác thứ tự đúng", () => {
    const random = seededRandom(1);
    for (const word of ["resilient", "catch", "ab"]) {
      const tiles = scrambleTiles(word, random);
      expect(sorted(tiles)).toBe(sorted(Array.from(word)));
      expect(tiles.join("")).not.toBe(word);
    }
  });

  it("cụm từ: bỏ khoảng trắng khỏi ô, ghép lại thì chèn lại", () => {
    const tiles = scrambleTiles("Give up", seededRandom(3));
    expect(sorted(tiles)).toBe(sorted(Array.from("giveup")));
    expect(assemble("give up", Array.from("giveup"))).toBe("give up");
    expect(assemble("well-known", Array.from("wellknown"))).toBe("well-known");
  });

  it("chữ toàn giống nhau thì không xáo được, trả nguyên", () => {
    expect(scrambleTiles("aaa")).toEqual(["a", "a", "a"]);
  });

  it("gợi ý: ô mang chữ kế tiếp; đặt sai rồi thì không gợi ý", () => {
    const tiles = ["t", "c", "a"];
    expect(nextTileIndex("cat", tiles, [])).toBe(1);
    expect(nextTileIndex("cat", tiles, [1])).toBe(2);
    expect(nextTileIndex("cat", tiles, [1, 2])).toBe(0);
    expect(nextTileIndex("cat", tiles, [1, 2, 0])).toBe(-1);
    expect(nextTileIndex("cat", tiles, [0])).toBe(-1);
  });

  it("chữ lặp: chọn ô còn trống mang đúng chữ", () => {
    const tiles = ["t", "e", "l", "t", "e", "r"];
    expect(nextTileIndex("letter", tiles, [2, 1, 0])).toBe(3);
  });
});

describe("điền chữ thiếu (cấp 2), chữ đầu + số ô (cấp 3)", () => {
  it("che khoảng 40% chữ cái, giữ chữ đầu, không che ký tự cố định", () => {
    const masked = maskedPositions("collocation", seededRandom(5));
    expect(masked.size).toBe(4);
    expect(masked.has(0)).toBe(false);
    const phrase = maskedPositions("give up", seededRandom(9));
    expect(phrase.has(4)).toBe(false);
    expect(phrase.has(0)).toBe(false);
  });

  it("từ ngắn vẫn che ít nhất 1 chữ", () => {
    expect(maskedPositions("go", seededRandom(2)).size).toBe(1);
    expect(maskedPositions("cat", seededRandom(2)).size).toBe(1);
  });

  it("mẫu cấp 2 và cấp 3", () => {
    expect(patternOf("cat", 2, new Set([1])).join("")).toBe("c" + "t");
    expect(patternOf("cat", 2, new Set([1]))).toEqual(["c", null, "t"]);
    expect(patternOf("Give up", 3)).toEqual(["g", null, null, null, " ", null, null]);
  });

  it("slotsOf: khoảng trắng, gạch nối, nháy là ký tự cố định", () => {
    expect(
      slotsOf("o'clock")
        .filter((s) => s.fixed)
        .map((s) => s.char),
    ).toEqual(["'"]);
    expect(slotsOf(" set-up ").map((s) => s.fixed)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
  });
});

describe("câu ví dụ khuyết từ", () => {
  it("ưu tiên khớp trọn từ, giữ nguyên hoa/thường trong câu", () => {
    expect(clozeOf("Running every day keeps me fit; I run too.", "run")).toEqual({
      before: "Running every day keeps me fit; I ",
      answer: "run",
      after: " too.",
    });
    expect(clozeOf("Resilient people recover fast.", "resilient")).toEqual({
      before: "",
      answer: "Resilient",
      after: " people recover fast.",
    });
  });

  it("cụm từ và dạng chia", () => {
    expect(clozeOf("She gave up smoking last year.", "gave up")?.answer).toBe("gave up");
  });

  it("không có trọn từ thì lấy chỗ khớp đầu tiên; không có thì null", () => {
    expect(clozeOf("They are runners.", "run")?.answer).toBe("run");
    expect(clozeOf("Nothing here.", "run")).toBeNull();
    expect(clozeOf("Anything", " ")).toBeNull();
  });
});
