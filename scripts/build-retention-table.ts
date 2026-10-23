/**
 * Bảng ước tính số lượt ôn mỗi ngày theo tỉ lệ nhớ mong muốn (Prompt 6.3, Cài đặt): mô phỏng 365
 * ngày (src/lib/srs/simulate.ts) cho từng số từ mới/ngày × tỉ lệ nhớ, có/không thẻ Chính tả, lấy
 * trung bình tháng 7–12 (khi tải đã gần ổn định). Mô phỏng mất vài giây mỗi lần nên tính sẵn ở đây,
 * app chỉ tra bảng.
 *
 *   npm run srs:retention-table
 */
import { writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";
import { DAILY_NEW_OPTIONS } from "@/lib/onboarding/settings";
import { RETENTION_OPTIONS } from "@/lib/srs/retention";
import { averageLoad, simulate } from "@/lib/srs/simulate";

const OUT = "src/lib/srs/retention-load.ts";

const table: Record<string, Record<string, { meaning: number; spelling: number }>> = {};
for (const newPerDay of DAILY_NEW_OPTIONS) {
  table[newPerDay] = {};
  for (const retention of RETENTION_OPTIONS) {
    const load = (spelling: boolean) =>
      Math.round(
        averageLoad(
          simulate({ days: 365, newPerDay, desiredRetention: retention, seed: 42, spelling }),
          182,
          365,
        ),
      );
    table[newPerDay]![retention] = { meaning: load(false), spelling: load(true) };
    console.log(newPerDay, retention, table[newPerDay]![retention]);
  }
}

const source = `// Sinh tự động bởi scripts/build-retention-table.ts (npm run srs:retention-table). KHÔNG SỬA TAY.
/**
 * Số lượt ôn trung bình mỗi ngày (tháng 7–12 khi học đều) theo số từ mới/ngày → tỉ lệ nhớ mong
 * muốn → chỉ thẻ Nghĩa (\`meaning\`) hoặc thêm thẻ Chính tả (\`spelling\`).
 */
export const RETENTION_LOAD: Record<
  number,
  Record<number, { meaning: number; spelling: number }>
> = ${JSON.stringify(table)};
`;
const config = await resolveConfig(OUT);
writeFileSync(OUT, await format(source, { ...config, filepath: OUT }));
console.log(`Đã ghi ${OUT}`);
