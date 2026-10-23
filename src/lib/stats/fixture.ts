/**
 * Bộ dữ liệu ôn mẫu cố định cho thống kê: unit test và test SQL đối chứng (scripts/build-stats-test.ts
 * → supabase/tests/stats.test.sql) dùng chung nên hai cách tính chạy trên cùng dữ liệu. Sinh bằng
 * số ngẫu nhiên có hạt giống: lần nào cũng ra đúng một bộ.
 */
import type { CardRow, ReviewLogRow, UserWordRow } from "@/lib/db/types";

export const FIXTURE_USER = "55555555-5555-4555-8555-555555555555";
export const FIXTURE_TZ = "Asia/Ho_Chi_Minh";
/** 10:00 sáng thứ Năm 22/10/2026 giờ Việt Nam. */
export const FIXTURE_NOW = new Date("2026-10-22T03:00:00Z");

const DAY = 86_400_000;

/** mulberry32: số ngẫu nhiên 0–1 có hạt giống. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UUID cố định theo nhóm (1 từ, 2 thẻ, 3 lượt ôn, 4 nghĩa, 5 từ trong kho) và số thứ tự. */
export function fixtureId(group: number, n: number): string {
  return `eeeeeeee-000${group}-4000-8000-${n.toString().padStart(12, "0")}`;
}

export type StatsFixture = {
  userWords: UserWordRow[];
  cards: CardRow[];
  logs: ReviewLogRow[];
  completedDays: Set<string>;
};

const iso = (ms: number) => new Date(ms).toISOString();

export function statsFixture(): StatsFixture {
  const random = seeded(20261022);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const now = FIXTURE_NOW.getTime();

  const userWords: UserWordRow[] = [];
  const cards: CardRow[] = [];
  for (let n = 1; n <= 40; n++) {
    // 1–30 đang học, 31–35 Sắp học, 36–38 tạm ngưng, 39–40 đã xóa.
    const status = n <= 30 ? "learning" : n <= 35 ? "queued" : n <= 38 ? "suspended" : "learning";
    const added = now - int(1, 120) * DAY - int(0, DAY);
    const id = fixtureId(1, n);
    userWords.push({
      id,
      user_id: FIXTURE_USER,
      sense_id: fixtureId(4, n),
      status,
      added_at: iso(added),
      introduced_at: status === "queued" ? null : iso(added),
      deleted_at: n >= 39 ? iso(now - DAY) : null,
      custom_meaning: null,
      custom_note: null,
      custom_image_url: null,
      user_additions: {},
      created_at: iso(added),
      updated_at: iso(added),
    });

    const skills = [
      "meaning",
      ...(n % 2 === 0 ? ["spelling"] : []),
      ...(n % 7 === 0 ? ["speaking"] : []),
    ];
    skills.forEach((skill, s) => {
      // Thẻ Nghĩa của từ Sắp học, và vài thẻ khác, chưa ôn lần nào.
      const fresh = status === "queued" || n % 11 === 0;
      const state = fresh ? 0 : int(1, 3) === 1 ? int(1, 3) : 2;
      const stability = state === 0 ? 0 : Math.round(random() * 4000) / 100;
      cards.push({
        id: fixtureId(2, n * 10 + s),
        user_id: FIXTURE_USER,
        user_word_id: id,
        skill,
        state,
        stability,
        difficulty: state === 0 ? 0 : 5,
        due: iso(state === 0 ? added : now + int(-5, 40) * DAY + int(-12, 12) * 3_600_000),
        lapses: state === 0 ? 0 : random() < 0.15 ? int(6, 9) : int(0, 3),
        reps: state === 0 ? 0 : int(1, 20),
        scheduled_days: 0,
        learning_steps: 0,
        last_review: state === 0 ? null : iso(now - int(1, 30) * DAY),
        deleted_at: n === 4 && skill === "spelling" ? iso(now - DAY) : null,
        created_at: iso(added),
        updated_at: iso(added),
      });
    });
  }

  const reviewed = cards.filter((c) => c.state !== 0);
  const modes: Record<string, string[]> = {
    meaning: ["flashcard", "mcq", "listening"],
    spelling: ["writing", "listening"],
    speaking: ["speaking"],
  };
  const logs: ReviewLogRow[] = [];
  for (let n = 1; n <= 1500; n++) {
    const card = reviewed[int(0, reviewed.length - 1)]!;
    // Nhiều lượt rơi vào 0:00–4:00 giờ VN (17:00–21:00Z) để thử mốc ngày học.
    const at = now - int(0, 90) * DAY - int(0, 23) * 3_600_000 - int(0, 59) * 60_000;
    const choices = modes[card.skill]!;
    const rating = random() < 0.15 ? 1 : int(2, 4);
    logs.push({
      id: fixtureId(3, n),
      user_id: FIXTURE_USER,
      card_id: card.id,
      mode: choices[int(0, choices.length - 1)]!,
      rating,
      state: random() < 0.7 ? 2 : int(0, 3),
      is_extra: random() < 0.1,
      response_ms: random() < 0.05 ? null : int(800, 90_000),
      correct: rating !== 1,
      hint_level: 0,
      pronunciation_score: card.skill === "speaking" ? int(30, 100) : null,
      reviewed_at: iso(Math.min(at, now)),
      elapsed_days: 0,
      scheduled_days: 0,
      created_at: iso(Math.min(at, now)),
    });
  }
  logs.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
  return { userWords, cards, logs, completedDays: new Set(["2026-10-20"]) };
}
