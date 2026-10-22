import { describe, expect, it } from "vitest";
import { loadExampleWords } from "@/lib/schema/examples";
import {
  TYPO_MIN_LETTERS,
  alignAnswer,
  answersForWord,
  applyVariant,
  checkAnswer,
  normalizeAnswer,
  type DiffPart,
} from "./spelling";

const words = new Map(loadExampleWords().map((w) => [w.lemma, w]));
const word = (lemma: string) => words.get(lemma)!;

/** Diff gọn để so: "=a" khớp, "~x>y" thay, "+y" thiếu, "-x" thừa, "<xy>yx" đổi chỗ. */
function compact(diff: DiffPart[]): string {
  return diff
    .map((p) =>
      p.op === "equal"
        ? `=${p.expected}`
        : p.op === "replace"
          ? `~${p.input}>${p.expected}`
          : p.op === "missing"
            ? `+${p.expected}`
            : p.op === "extra"
              ? `-${p.input}`
              : `<${p.input}>${p.expected}`,
    )
    .join(" ");
}

/** Ghép lại chuỗi người học gõ / chuỗi đúng từ diff. */
const inputOf = (diff: DiffPart[]) => diff.map((p) => p.input).join("");
const expectedOf = (diff: DiffPart[]) => diff.map((p) => p.expected).join("");

describe("normalizeAnswer", () => {
  it.each([
    ["  Resilient ", "resilient"],
    ["RESILIENT", "resilient"],
    ["give   up", "give up"],
    ["give\tup\n", "give up"],
    ["resilient.", "resilient"],
    ["resilient!?", "resilient"],
    ["resilient …", "resilient"],
    ["“resilient”", "resilient"],
    ["don’t", "don't"],
    ["well‐known", "well-known"],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeAnswer(raw)).toBe(expected);
  });

  it("chuỗi chỉ có dấu câu hoặc khoảng trắng thành rỗng", () => {
    expect(normalizeAnswer(" . ")).toBe("");
  });
});

describe("alignAnswer – Damerau-Levenshtein", () => {
  it.each([
    ["resilient", "resilient", 0],
    ["resilent", "resilient", 1],
    ["resiliennt", "resilient", 1],
    ["resiloent", "resilient", 1],
    ["reislient", "resilient", 1],
    ["rseilinet", "resilient", 2],
    ["", "cat", 3],
    ["cat", "", 3],
    ["ca", "abc", 3],
  ])("%j so với %j: %i lỗi", (input, expected, distance) => {
    expect(alignAnswer(input, expected).distance).toBe(distance);
  });

  it("diff từng chữ: thiếu, thừa, thay, đổi chỗ", () => {
    expect(compact(alignAnswer("resilent", "resilient").diff)).toBe("=r =e =s =i =l +i =e =n =t");
    expect(compact(alignAnswer("catt", "cat").diff)).toBe("=c =a -t =t");
    expect(compact(alignAnswer("cot", "cat").diff)).toBe("=c ~o>a =t");
    expect(compact(alignAnswer("recieve", "receive").diff)).toBe("=r =e =c <ie>ei =v =e");
  });

  it("diff ghép lại đúng cả hai chuỗi", () => {
    for (const [input, expected] of [
      ["accomodation", "accommodation"],
      ["enviroment", "environment"],
      ["xyz", "resilient"],
      ["gave up", "give up"],
    ] as const) {
      const { diff } = alignAnswer(input, expected);
      expect(inputOf(diff)).toBe(input);
      expect(expectedOf(diff)).toBe(expected);
    }
  });

  it("đếm theo chữ, không theo đơn vị UTF-16", () => {
    expect(alignAnswer("café", "cafe").distance).toBe(1);
    expect(alignAnswer("😀a", "a").distance).toBe(1);
  });
});

describe("checkAnswer", () => {
  it("khớp sau khi bỏ hoa/thường, khoảng trắng, dấu câu cuối", () => {
    const result = checkAnswer("  Resilient. ", "resilient");
    expect(result).toMatchObject({ correct: true, typoCount: 0, reason: "exact" });
    expect(result.diff.every((p) => p.op === "equal")).toBe(true);
  });

  it(`sai 1 lỗi với từ ≥ ${TYPO_MIN_LETTERS} chữ: đúng nhưng typoCount = 1`, () => {
    expect(checkAnswer("resilent", "resilient")).toMatchObject({
      correct: true,
      typoCount: 1,
      reason: "typo",
    });
    expect(checkAnswer("recieve", "receive")).toMatchObject({ correct: true, typoCount: 1 });
    expect(checkAnswer("hause", "house")).toMatchObject({ correct: true, typoCount: 1 });
  });

  it("từ ngắn hơn 5 chữ: sai 1 lỗi là sai", () => {
    expect(checkAnswer("caf", "cat")).toMatchObject({
      correct: false,
      typoCount: 1,
      reason: "wrong",
    });
    expect(checkAnswer("bok", "book")).toMatchObject({ correct: false, typoCount: 1 });
  });

  it("sai 2 lỗi trở lên là sai", () => {
    expect(checkAnswer("resilant", "resiliant")).toMatchObject({ correct: true });
    expect(checkAnswer("rezilyent", "resilient")).toMatchObject({ correct: false, typoCount: 2 });
  });

  it("cụm từ: tính chữ cái không tính khoảng trắng, sai 1 lỗi vẫn đúng", () => {
    expect(checkAnswer("giveup", "give up")).toMatchObject({ correct: true, typoCount: 1 });
    expect(checkAnswer("Give Up!", "give up")).toMatchObject({ correct: true, typoCount: 0 });
  });

  it("tắt allowTypo thì phải đúng tuyệt đối", () => {
    expect(checkAnswer("resilent", "resilient", { allowTypo: false })).toMatchObject({
      correct: false,
      typoCount: 1,
      reason: "wrong",
    });
  });

  it("bỏ trống là sai, diff là toàn bộ chữ còn thiếu", () => {
    const result = checkAnswer("   ", "cat");
    expect(result).toMatchObject({ correct: false, reason: "empty", typoCount: 3 });
    expect(compact(result.diff)).toBe("+c +a +t");
  });

  it("chấp nhận cách viết khác, so diff với biến thể gần nhất", () => {
    expect(checkAnswer("color", "colour", { accepted: ["color"] })).toMatchObject({
      correct: true,
      typoCount: 0,
      reason: "variant",
      matched: "color",
    });
    // "colr" gần "color" (1 lỗi, 5 chữ) hơn "colour" (2 lỗi): đúng, diff theo "color".
    expect(checkAnswer("colr", "colour", { accepted: ["color"] })).toMatchObject({
      correct: true,
      typoCount: 1,
      matched: "color",
    });
    expect(checkAnswer("organizd", "organised", { accepted: ["organized"] })).toMatchObject({
      correct: true,
      typoCount: 1,
      matched: "organized",
    });
  });

  it("gõ dạng khác của cùng từ: sai, báo sai dạng", () => {
    expect(checkAnswer("meet", "met", { otherForms: ["meet", "meets", "meeting"] })).toMatchObject({
      correct: false,
      reason: "wrong_form",
      matched: "met",
    });
  });

  it("từ dễ nhầm không bao giờ được coi là lỗi gõ", () => {
    expect(checkAnswer("quiet", "quite")).toMatchObject({ correct: true, reason: "typo" });
    expect(checkAnswer("quiet", "quite", { rejected: ["quiet"] })).toMatchObject({
      correct: false,
      reason: "other_word",
      typoCount: 1,
    });
  });

  it("đáp án chính cũng nằm trong danh sách khác thì vẫn đúng", () => {
    expect(
      checkAnswer("run", "run", { otherForms: ["run", "ran"], rejected: ["run"] }),
    ).toMatchObject({ correct: true, reason: "exact" });
  });
});

describe("applyVariant", () => {
  it.each([
    ["colour", "colour", "color", "color"],
    ["colours", "colour", "color", "colors"],
    ["organised", "organise", "organize", "organized"],
    ["organising", "organise", "organize", "organizing"],
    ["centres", "centre", "center", "centers"],
    ["analysing", "analyse", "analyze", "analyzing"],
    ["colors", "color", "colour", "colours"],
  ])("%s (%s → %s) → %s", (form, lemma, variant, expected) => {
    expect(applyVariant(form, lemma, variant)).toBe(expected);
  });

  it("dạng chia không mở đầu như từ gốc thì không áp được", () => {
    expect(applyVariant("went", "go", "goe")).toBeNull();
    expect(applyVariant("colour", "colour", "colour")).toBeNull();
  });
});

describe("answersForWord – từ nội dung trong kho", () => {
  it("đề nghĩa tiếng Việt: đáp án là từ gốc, chấp nhận biến thể Anh–Mỹ", () => {
    const { target, options } = answersForWord(word("colour"));
    expect(target).toBe("colour");
    expect(options.accepted).toEqual(["color"]);
    expect(options.otherForms).toEqual(["colours", "colors"]);
    // "color" vừa là từ dễ nhầm vừa là biến thể: biến thể thắng.
    expect(checkAnswer("Color", target, options)).toMatchObject({
      correct: true,
      reason: "variant",
    });
    expect(checkAnswer("colours", target, options)).toMatchObject({ reason: "wrong_form" });
  });

  it("câu khuyết từ: đáp án là đúng dạng câu yêu cầu", () => {
    const { target, options } = answersForWord(word("colour"), "colours");
    expect(target).toBe("colours");
    expect(options.accepted).toEqual(["colors"]);
    expect(checkAnswer("colors", target, options).correct).toBe(true);
    expect(checkAnswer("colour", target, options)).toMatchObject({ reason: "wrong_form" });
  });

  it("động từ bất quy tắc: met cho meet thì quá khứ", () => {
    const { target, options } = answersForWord(word("meet"), "met");
    expect(checkAnswer("met", target, options).correct).toBe(true);
    expect(checkAnswer("meet", target, options)).toMatchObject({
      correct: false,
      reason: "wrong_form",
    });
    expect(checkAnswer("meat", target, options)).toMatchObject({
      correct: false,
      reason: "other_word",
    });
  });

  it("dạng chia trùng từ gốc (run – run – run) vẫn là đáp án đúng", () => {
    const { target, options } = answersForWord(word("run"), "run");
    expect(options.otherForms).not.toContain("run");
    expect(checkAnswer("run", target, options).correct).toBe(true);
    expect(checkAnswer("ran", target, options)).toMatchObject({ reason: "wrong_form" });
  });

  it("cụm động từ: gave up cho give up thì sai dạng", () => {
    const { target, options } = answersForWord(word("give up"));
    expect(checkAnswer("give up", target, options).correct).toBe(true);
    expect(checkAnswer("gave up", target, options)).toMatchObject({ reason: "wrong_form" });
  });

  it("affect/effect: từ dễ nhầm sai 1 chữ vẫn là sai", () => {
    const { target, options } = answersForWord(word("affect"));
    expect(checkAnswer("effect", target, options)).toMatchObject({
      correct: false,
      reason: "other_word",
    });
    expect(checkAnswer("afect", target, options)).toMatchObject({ correct: true, typoCount: 1 });
  });
});
