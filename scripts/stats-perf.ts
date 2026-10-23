/**
 * Đo tốc độ thống kê (tiêu chí GĐ6: trang Thống kê tải dưới 1 giây với 50.000 lượt ôn): 2.000 từ,
 * 4.000 thẻ, 50.000 lượt ôn rải trong 5 năm. Chạy riêng (không cùng unit test song song) để số đo
 * ổn định; báo lỗi nếu phần tính (kể cả dựng lại lịch sử) quá 1 giây.
 *
 * Chạy: npm run stats:perf
 */
import { Rating, State } from "ts-fsrs";
import type { CardRow, ReviewLogRow, UserWordRow } from "../src/lib/db/types";
import { createScheduler } from "../src/lib/srs/scheduler";
import { computeStats, statusHistory } from "../src/lib/stats/stats";

const BUDGET_MS = 1000;
const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-10-22T03:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const userWords: UserWordRow[] = Array.from({ length: 2000 }, (_, i) => ({
  id: `w${i}`,
  user_id: "u",
  sense_id: `s${i}`,
  status: "learning",
  added_at: iso(NOW.getTime() - (i % 1825) * DAY),
  introduced_at: null,
  deleted_at: null,
  custom_meaning: null,
  custom_note: null,
  custom_image_url: null,
  user_additions: {},
  created_at: iso(NOW.getTime()),
  updated_at: iso(NOW.getTime()),
}));

const cards: CardRow[] = userWords.flatMap((w, i) =>
  (["meaning", "spelling"] as const).map((skill) => ({
    id: `${w.id}:${skill}`,
    user_id: "u",
    user_word_id: w.id,
    skill,
    state: State.Review,
    stability: i % 40,
    difficulty: 5,
    due: iso(NOW.getTime() + (i % 60) * DAY),
    lapses: i % 8,
    reps: 5,
    scheduled_days: 5,
    learning_steps: 0,
    last_review: null,
    deleted_at: null,
    created_at: iso(NOW.getTime()),
    updated_at: iso(NOW.getTime()),
  })),
);

const logs: ReviewLogRow[] = Array.from({ length: 50_000 }, (_, i) => {
  const at = iso(NOW.getTime() - ((i * 7.3) % 1825) * DAY);
  return {
    id: `l${i}`,
    user_id: "u",
    card_id: cards[i % cards.length]!.id,
    mode: i % 2 ? "mcq" : "writing",
    rating: i % 9 === 0 ? Rating.Again : Rating.Good,
    state: State.Review,
    is_extra: false,
    response_ms: 5_000 + (i % 30) * 1_000,
    correct: i % 9 !== 0,
    hint_level: 0,
    pronunciation_score: null,
    reviewed_at: at,
    elapsed_days: 0,
    scheduled_days: 0,
    created_at: at,
  };
}).sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));

const scheduler = createScheduler();
const runs: number[] = [];
for (let run = 0; run < 3; run++) {
  const start = performance.now();
  computeStats({ userWords, cards, logs, completedDays: new Set(), now: NOW, timeZone: TZ });
  statusHistory({ userWords, cards, logs }, scheduler, NOW, TZ);
  runs.push(performance.now() - start);
}
// Lần đầu có thêm chi phí khởi động (JIT); lấy lần nhanh nhất.
const best = Math.min(...runs);
console.log(`50.000 lượt ôn: ${runs.map((ms) => `${Math.round(ms)} ms`).join(", ")}`);
if (best > BUDGET_MS) {
  console.error(`Chậm hơn ${BUDGET_MS} ms.`);
  process.exit(1);
}
