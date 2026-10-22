/**
 * Mô phỏng 365 ngày học với lịch FSRS của app và ghi bảng tải ôn vào docs/qa/srs-simulation.md.
 *
 *   npm run srs:simulate
 */
import { writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { averageLoad, simulate } from "@/lib/srs/simulate";

const REPORT = "docs/qa/srs-simulation.md";
const SCENARIOS = [5, 10, 20];
const runs = SCENARIOS.map((newPerDay) => ({
  newPerDay,
  days: simulate({ days: 365, newPerDay, seed: 42 }),
}));

const months = Array.from({ length: 12 }, (_, m) => [
  Math.round(m * 30.42),
  Math.round((m + 1) * 30.42),
]);
const bar = (value: number, max: number) => "█".repeat(Math.max(1, Math.round((value / max) * 30)));
const main = runs.find((r) => r.newPerDay === 10)!;
const peak = Math.max(...months.map(([a, b]) => averageLoad(main.days, a!, b!)));

const retention = (days: (typeof runs)[number]["days"]) => {
  const due = days.reduce((s, d) => s + d.dueReviews, 0);
  return days.reduce((s, d) => s + d.recalled, 0) / due;
};

const lines = [
  "# Mô phỏng lịch ôn 365 ngày (Prompt 3.1)",
  "",
  "Sinh bởi `npm run srs:simulate` (src/lib/srs/simulate.ts). Mỗi ngày người học thêm N từ mới và",
  "ôn hết thẻ đến hạn; nhớ hay quên theo đúng khả năng nhớ R của mô hình FSRS (tỉ lệ nhớ mục tiêu",
  "90%, bước học 1 phút / 10 phút, khoảng cách tối đa 365 ngày, có fuzz). Từ mới lần đầu: 80% Được.",
  "",
  "## Tải ôn trung bình mỗi ngày theo tháng",
  "",
  `| Tháng | ${SCENARIOS.map((n) => `${n} từ/ngày`).join(" | ")} | Biểu đồ (10 từ/ngày) |`,
  `|---|${SCENARIOS.map(() => "---").join("|")}|---|`,
  ...months.map(([a, b], m) => {
    const loads = runs.map((r) => averageLoad(r.days, a!, b!));
    return `| ${m + 1} | ${loads.map((l) => l.toFixed(0)).join(" | ")} | ${bar(loads[1]!, peak)} |`;
  }),
  "",
  "## Tóm tắt",
  "",
  ...runs.map((r) => {
    const mid = averageLoad(r.days, 90, 180);
    const late = averageLoad(r.days, 270, 365);
    const max = Math.max(...r.days.map((d) => d.reviews));
    return (
      `- **${r.newPerDay} từ/ngày**: quý 2 ~${mid.toFixed(0)} lượt/ngày, quý 4 ~${late.toFixed(0)} ` +
      `(tăng ${(late / mid).toFixed(2)}× trong khi số thẻ tăng ~2,35×), ngày cao nhất ${max}, ` +
      `tỉ lệ nhớ thực tế ${(retention(r.days) * 100).toFixed(1)}%, ` +
      `ước tính ~${Math.round((late * 8) / 60)} phút/ngày cuối năm (8 giây/câu).`
    );
  }),
  "",
  "Tải tăng chậm dần vì mỗi lần nhớ đúng, khoảng cách tới lần ôn sau dài ra. Tải không đi ngang hẳn:",
  "chạy thử 2 năm (10 từ/ngày) cho quý 4 ~113 lượt/ngày, quý 8 ~143 (+27% trong khi số thẻ gấp đôi).",
  "Muốn giữ tải ổn định lâu dài thì giảm số từ mới/ngày khi tải vượt thời gian người học có.",
];

const text = lines.join("\n") + "\n";
writeFileSync(REPORT, await format(text, { ...(await resolveConfig(REPORT)), filepath: REPORT }));
console.log(text);
