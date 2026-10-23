import { State } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CardRow, NotebookEntryRow, UserWordRow } from "@/lib/db/types";
import { createCards } from "@/lib/srs/cards";
import { createScheduler } from "@/lib/srs/scheduler";
import { seededRandom } from "@/lib/srs/simulate";
import {
  DEFAULT_PRACTICE,
  buildPractice,
  parsePractice,
  practiceQuery,
  practiceWords,
  type PracticeInput,
  type PracticeRequest,
} from "./practice";

const NOW = new Date("2026-10-22T08:00:00Z");
const DAY = 86_400_000;
const scheduler = createScheduler();

const uw = (n: number, status: UserWordRow["status"] = "learning") =>
  ({
    id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
    user_id: "u1",
    sense_id: `s${n}`,
    status,
    deleted_at: null,
  }) as UserWordRow;

/** Thẻ đã ôn: độ bền S ngày, ôn lần cuối cách đây `ago` ngày, đến hạn sau `dueIn` ngày. */
function card(
  word: UserWordRow,
  skill: "meaning" | "spelling",
  { stability = 5, ago = 2, dueIn = 3, state = State.Review as number, lapses = 0 } = {},
): CardRow {
  return {
    ...createCards(word, [skill], NOW)[0]!,
    state,
    stability,
    difficulty: 5,
    reps: state === 0 ? 0 : 3,
    lapses,
    scheduled_days: Math.round(stability),
    last_review: state === 0 ? null : new Date(NOW.getTime() - ago * DAY).toISOString(),
    due: new Date(NOW.getTime() + dueIn * DAY).toISOString(),
  };
}

const entry = (word: UserWordRow, notebook: string, tags: string[] = []) =>
  ({
    id: `e-${word.id}-${notebook}`,
    user_word_id: word.id,
    notebook_id: notebook,
    tags,
    deleted_at: null,
  }) as unknown as NotebookEntryRow;

const words = [uw(1), uw(2), uw(3), uw(4), uw(5, "queued"), uw(6, "suspended"), uw(7)];
const cards = [
  card(words[0]!, "meaning", { stability: 2, ago: 6 }), // sắp quên nhất
  card(words[0]!, "spelling", { state: State.New, dueIn: 0 }),
  card(words[1]!, "meaning", { stability: 30, ago: 1 }), // thành thạo
  card(words[1]!, "spelling", { stability: 4, ago: 1 }),
  card(words[2]!, "meaning", { stability: 10, ago: 12, dueIn: -2, lapses: 6 }), // đến hạn, hay quên
  card(words[3]!, "meaning", { state: State.New }), // chưa học
  card(words[4]!, "meaning"),
  card(words[5]!, "meaning"),
  card(words[6]!, "meaning", { stability: 8, ago: 3 }),
];
const entries = [
  entry(words[0]!, "nb1", ["IELTS"]),
  entry(words[1]!, "nb1"),
  entry(words[2]!, "nb2", ["ielts", "work"]),
  entry(words[3]!, "nb1"),
  entry(words[4]!, "nb1"),
  entry(words[5]!, "nb1"),
  entry(words[6]!, "nb2"),
];
const input: PracticeInput = { userWords: words, cards, entries, practiceSpelling: true };
const request = (over: Partial<PracticeRequest> = {}): PracticeRequest => ({
  ...DEFAULT_PRACTICE,
  ...over,
});
const senses = (list: { userWord: UserWordRow }[]) => list.map((w) => w.userWord.sense_id);
const cardOf = (id: string) => cards.find((c) => c.id === id)!;

describe("practiceWords – phạm vi", () => {
  it("chỉ từ đã học: bỏ từ chưa ôn, Sắp học, Tạm ngưng", () => {
    expect(senses(practiceWords(input, request()))).toEqual(["s1", "s2", "s3", "s7"]);
  });

  it("theo sổ tay, theo tag (không phân biệt hoa/thường)", () => {
    expect(senses(practiceWords(input, request({ notebookId: "nb2" })))).toEqual(["s3", "s7"]);
    expect(senses(practiceWords(input, request({ tag: "IELTS" })))).toEqual(["s1", "s3"]);
    expect(senses(practiceWords(input, request({ notebookId: "nb1", tag: "ielts" })))).toEqual([
      "s1",
    ]);
  });

  it("theo trạng thái: Đang học, Đã thuộc, Thành thạo, Hay quên", () => {
    expect(senses(practiceWords(input, request({ status: "learning" })))).toEqual(["s1"]);
    expect(senses(practiceWords(input, request({ status: "known" })))).toEqual(["s3", "s7"]);
    expect(senses(practiceWords(input, request({ status: "mastered" })))).toEqual(["s2"]);
    expect(senses(practiceWords(input, request({ status: "leech" })))).toEqual(["s3"]);
  });
});

describe("buildPractice", () => {
  it("Trộn tự động: mỗi từ một câu, không ép chế độ", () => {
    const plan = buildPractice(input, request(), scheduler, NOW, seededRandom(1));
    expect(plan.available).toBe(4);
    expect(plan.items).toHaveLength(4);
    expect(new Set(plan.items.map((i) => cardOf(i.cardId).user_word_id)).size).toBe(4);
    expect(plan.items.every((i) => i.mode === undefined && !i.isNew)).toBe(true);
  });

  it("cắt theo số câu", () => {
    const many: PracticeInput = {
      ...input,
      userWords: Array.from({ length: 25 }, (_, i) => uw(100 + i)),
      cards: Array.from({ length: 25 }, (_, i) => card(uw(100 + i), "meaning")),
      entries: Array.from({ length: 25 }, (_, i) => entry(uw(100 + i), "nb1")),
    };
    const plan = buildPractice(many, request({ count: 20 }), scheduler, NOW);
    expect(plan.items).toHaveLength(20);
    expect(plan.available).toBe(25);
  });

  it("thẻ chưa đến hạn là ôn ngoài lịch; thẻ đến hạn là lượt ôn thật", () => {
    const plan = buildPractice(input, request({ mode: "mcq" }), scheduler, NOW);
    const due = cards[4]!.id;
    expect(plan.items.map((i) => i.cardId)).toContain(due);
    expect(plan.extra).not.toContain(due);
    expect(plan.extra).toHaveLength(plan.items.length - 1);
    expect(plan.items.every((i) => i.mode === "mcq")).toBe(true);
  });

  it("thẻ sắp quên nhất (R thấp) đứng đầu", () => {
    const plan = buildPractice(input, request({ mode: "flashcard" }), scheduler, NOW);
    expect(plan.items[0]!.cardId).toBe(cards[0]!.id);
  });

  it("Tập viết chỉ có từ đã có thẻ Chính tả", () => {
    const plan = buildPractice(input, request({ mode: "writing" }), scheduler, NOW);
    expect(plan.items.map((i) => i.cardId).sort()).toEqual([cards[1]!.id, cards[3]!.id].sort());
    expect(plan.available).toBe(2);
  });

  it("Tập nghe: thẻ Chính tả mức 2 trở lên (nghe → gõ), còn lại thẻ Nghĩa (nghe → chọn nghĩa)", () => {
    const plan = buildPractice(input, request({ mode: "listening" }), scheduler, NOW);
    const picked = plan.items.map((i) => {
      const c = cardOf(i.cardId);
      return `${words.find((w) => w.id === c.user_word_id)!.sense_id}:${c.skill}`;
    });
    expect(picked.sort()).toEqual(["s1:meaning", "s2:spelling", "s3:meaning", "s7:meaning"]);
  });

  it("Tập phát âm chỉ có từ đã có thẻ Phát âm", () => {
    const speaking = card(words[1]!, "speaking" as "spelling", { stability: 3 });
    const plan = buildPractice(
      { ...input, cards: [...cards, { ...speaking, skill: "speaking" }] },
      request({ mode: "speaking" }),
      scheduler,
      NOW,
    );
    expect(plan.items).toEqual([{ cardId: speaking.id, isNew: false, mode: "speaking" }]);
    expect(buildPractice(input, request({ mode: "speaking" }), scheduler, NOW).available).toBe(0);
  });

  it("tắt Luyện chính tả: Trộn tự động chỉ dùng thẻ Nghĩa", () => {
    const plan = buildPractice(
      { ...input, practiceSpelling: false },
      request(),
      scheduler,
      NOW,
      () => 0,
    );
    expect(plan.items.every((i) => cardOf(i.cardId).skill === "meaning")).toBe(true);
  });

  it("không có từ phù hợp thì rỗng", () => {
    const plan = buildPractice(input, request({ notebookId: "none" }), scheduler, NOW);
    expect(plan).toEqual({ items: [], extra: [], available: 0 });
  });
});

describe("tham số URL", () => {
  it("ghi rồi đọc lại được", () => {
    const value = request({
      notebookId: "nb1",
      tag: "IELTS",
      status: "known",
      mode: "writing",
      count: 30,
    });
    const params = Object.fromEntries(new URLSearchParams(practiceQuery(value)));
    expect(params.practice).toBe("1");
    expect(parsePractice(params)).toEqual(value);
  });

  it("giá trị lạ thì dùng mặc định", () => {
    expect(parsePractice({ mode: "dancing", status: "x", n: "15" })).toEqual(DEFAULT_PRACTICE);
  });
});
