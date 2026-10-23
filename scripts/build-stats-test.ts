/**
 * Đối chứng thống kê với SQL (Prompt 6.1): sinh supabase/tests/stats.test.sql từ bộ dữ liệu mẫu cố
 * định (src/lib/stats/fixture.ts). File chèn dữ liệu đó vào Postgres, tính lại 3 chỉ số bằng truy
 * vấn SQL viết riêng (tỉ lệ nhớ 30 ngày, số từ theo trạng thái, dự báo 7 ngày) và so với số do
 * src/lib/stats tính.
 *
 * Chạy: npm run stats:sql. CI: npm run stats:sql -- --check (báo lỗi nếu file cũ), rồi
 * `supabase test db` chạy file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  FIXTURE_NOW,
  FIXTURE_TZ,
  FIXTURE_USER,
  fixtureId,
  statsFixture,
} from "../src/lib/stats/fixture";
import { computeStats } from "../src/lib/stats/stats";

const OUT = "supabase/tests/stats.test.sql";

function lit(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function insert(table: string, rows: Record<string, string | number | boolean | null>[]): string {
  const columns = Object.keys(rows[0]!);
  const values = rows.map((r) => `  (${columns.map((c) => lit(r[c]!)).join(", ")})`);
  return `insert into public.${table} (${columns.join(", ")}) values\n${values.join(",\n")};`;
}

const fixture = statsFixture();
const stats = computeStats({ ...fixture, now: FIXTURE_NOW, timeZone: FIXTURE_TZ });
const s = stats.statuses;
const forecast7 = stats.forecast.slice(0, 7).map((d) => d.value);

const now = lit(FIXTURE_NOW.toISOString());
const tz = lit(FIXTURE_TZ);
const user = lit(FIXTURE_USER);
/** Ngày học (lùi 4 giờ) của một cột thời gian. */
const studyDay = (column: string) => `((${column} at time zone ${tz}) - interval '4 hours')::date`;

const words = fixture.userWords.map((_, i) => ({
  id: fixtureId(5, i + 1),
  language: "en",
  lemma: `stats-test-${i + 1}`,
  pos: "noun",
}));
const senses = fixture.userWords.map((uw, i) => ({
  id: uw.sense_id,
  word_id: words[i]!.id,
  sense_order: 0,
  definition_en: "a test",
  meaning_vi: "từ thử",
}));

const sql = `-- Sinh tự động bởi scripts/build-stats-test.ts (npm run stats:sql). KHÔNG SỬA TAY.
-- Đối chứng src/lib/stats với truy vấn SQL trên cùng bộ dữ liệu mẫu (src/lib/stats/fixture.ts).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values (${user}, 'stats@test.local');
${insert("words", words)}
${insert("word_senses", senses)}
${insert(
  "user_words",
  fixture.userWords.map((uw) => ({
    id: uw.id,
    user_id: uw.user_id,
    sense_id: uw.sense_id,
    status: uw.status,
    added_at: uw.added_at,
    introduced_at: uw.introduced_at,
    deleted_at: uw.deleted_at,
  })),
)}
${insert(
  "cards",
  fixture.cards.map((c) => ({
    id: c.id,
    user_id: c.user_id,
    user_word_id: c.user_word_id,
    skill: c.skill,
    state: c.state,
    stability: c.stability,
    difficulty: c.difficulty,
    due: c.due,
    lapses: c.lapses,
    reps: c.reps,
    last_review: c.last_review,
    deleted_at: c.deleted_at,
  })),
)}
${insert(
  "review_logs",
  fixture.logs.map((l) => ({
    id: l.id,
    user_id: l.user_id,
    card_id: l.card_id,
    mode: l.mode,
    rating: l.rating,
    state: l.state,
    is_extra: l.is_extra,
    response_ms: l.response_ms,
    pronunciation_score: l.pronunciation_score,
    reviewed_at: l.reviewed_at,
  })),
)}

-- Tỉ lệ nhớ thực tế 30 ngày: lượt ôn đến hạn (state = Review, không ôn ngoài lịch), nhớ = rating > 1.
select is(
  (select row(count(*) filter (where rating > 1), count(*))::text
   from public.review_logs
   where user_id = ${user} and not is_extra and state = 2 and reviewed_at <= ${now}
     and ${studyDay("reviewed_at")} >= ${studyDay(now + "::timestamptz")} - 29),
  ${lit(`(${stats.retention30.recalled},${stats.retention30.reviews})`)},
  'Tỉ lệ nhớ 30 ngày khớp (nhớ, tổng)');

-- Số từ theo trạng thái: Sắp học hoặc chưa ôn = Mới; mức thuộc theo độ bền thẻ Nghĩa (3/7/21 ngày).
select is(
  (select row(
     count(*) filter (where status = 'queued' or (status = 'learning' and coalesce(c.state, 0) = 0)),
     count(*) filter (where status = 'learning' and c.state in (1, 3)
                        or status = 'learning' and c.state = 2 and c.stability < 7),
     count(*) filter (where status = 'learning' and c.state = 2 and c.stability >= 7 and c.stability < 21),
     count(*) filter (where status = 'learning' and c.state = 2 and c.stability >= 21),
     count(*) filter (where status = 'suspended'))::text
   from public.user_words w
   left join public.cards c on c.user_word_id = w.id and c.skill = 'meaning' and c.deleted_at is null
   where w.user_id = ${user} and w.deleted_at is null),
  ${lit(`(${s.new},${s.learning},${s.known},${s.mastered},${s.suspended})`)},
  'Số từ theo trạng thái khớp (mới, đang học, đã thuộc, thành thạo, tạm ngưng)');

-- Dự báo 7 ngày: thẻ đã ôn (Nghĩa, Chính tả) của từ đang học, quá hạn tính vào hôm nay.
select is(
  (select array_agg(coalesce(n, 0) order by d)::text
   from generate_series(0, 6) d
   left join (
     select greatest(0, ${studyDay("c.due")} - ${studyDay(now + "::timestamptz")}) as d, count(*) as n
     from public.cards c
     join public.user_words w on w.id = c.user_word_id
     where c.user_id = ${user} and c.deleted_at is null and c.state <> 0
       and c.skill in ('meaning', 'spelling') and w.deleted_at is null and w.status = 'learning'
     group by 1
   ) f using (d)),
  ${lit(`{${forecast7.join(",")}}`)},
  'Dự báo số thẻ đến hạn 7 ngày khớp');

select * from finish();
rollback;
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    // Chưa có file.
  }
  if (current !== sql) {
    console.error(`${OUT} cũ: chạy npm run stats:sql rồi commit.`);
    process.exit(1);
  }
} else {
  writeFileSync(OUT, sql);
  console.log(`Đã ghi ${OUT}`);
}
