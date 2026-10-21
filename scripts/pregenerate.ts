/**
 * Tạo trước nội dung cho các từ thông dụng (danh sách NGSL 1.2, ~2.800 từ, CC BY-SA 4.0).
 *
 * Script chỉ XẾP VIỆC (word_jobs, nguồn "bulk"); worker generate-word trên Supabase tự chạy
 * dần mỗi phút qua pg_cron, nên máy không cần bật suốt và việc tự tiếp tục qua nhiều ngày:
 *   - chỉ chạy khi không có việc của người dùng (người dùng luôn được ưu tiên);
 *   - tối đa private.settings.bulk_daily_new_words từ mỗi ngày, worker_parallel worker mỗi phút;
 *   - bị giới hạn lượt gọi thì việc tự xếp lại; từ đã có trong kho hoặc đang chờ thì bỏ qua,
 *     nên chạy lại script bao nhiêu lần cũng an toàn.
 *
 *   npm run pregenerate -- --limit 100 --sql out.sql   ghi lệnh SQL (chạy qua SQL editor/MCP)
 *   npm run pregenerate -- --offset 100                 xếp việc trực tiếp (cần biến môi trường
 *                                                       SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   npm run pregenerate -- --status                     xem tiến độ
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import { cleanSurface } from "@/lib/entry/lemma";

const LIST = "data/wordlists/ngsl-1.2.csv";
const CHUNK = 500;

export interface BulkItem {
  lemma: string;
  frequency_rank: number;
}

/** CSV NGSL: "Lemma,SFI Rank,…". Danh sách đã ở dạng gốc nên chỉ làm sạch, không lemmatize. */
export function readNgsl(csv: string): BulkItem[] {
  const seen = new Set<string>();
  const items: BulkItem[] = [];
  for (const line of csv.replaceAll("\r\n", "\n").split("\n").slice(1)) {
    const [word, rank] = line.split(",");
    const lemma = cleanSurface(word ?? "");
    const frequencyRank = Number(rank);
    if (!lemma || !Number.isInteger(frequencyRank) || seen.has(lemma)) continue;
    seen.add(lemma);
    items.push({ lemma, frequency_rank: frequencyRank });
  }
  return items.sort((a, b) => a.frequency_rank - b.frequency_rank);
}

function sqlLiteral(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string" },
      offset: { type: "string", default: "0" },
      sql: { type: "string" },
      status: { type: "boolean", default: false },
    },
  });

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const client =
    url && key ? createClient<Database>(url, key, { auth: { persistSession: false } }) : null;

  if (values.status) {
    if (!client) throw new Error("Cần SUPABASE_URL và SUPABASE_SECRET_KEY trong .env.local");
    const { data, error } = await client.from("word_jobs").select("status").eq("source", "bulk");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const row of data) counts[row.status] = (counts[row.status] ?? 0) + 1;
    console.table(counts);
    return;
  }

  const offset = Number(values.offset);
  const all = readNgsl(readFileSync(LIST, "utf8"));
  const items = all.slice(offset, values.limit ? offset + Number(values.limit) : undefined);
  console.log(
    `NGSL: ${all.length} từ; chọn ${items.length} từ (vị trí ${offset}–${offset + items.length - 1}).`,
  );

  if (values.sql) {
    const statements = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = JSON.stringify(items.slice(i, i + CHUNK));
      statements.push(`select public.enqueue_bulk_words('en', ${sqlLiteral(chunk)}::jsonb);`);
    }
    writeFileSync(values.sql, statements.join("\n") + "\n");
    console.log(`Đã ghi ${values.sql} (${statements.length} lệnh).`);
    return;
  }

  if (!client) {
    throw new Error(
      "Cần SUPABASE_URL và SUPABASE_SECRET_KEY trong .env.local, hoặc dùng --sql <file>",
    );
  }
  let queued = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const { data, error } = await client.rpc("enqueue_bulk_words", {
      p_language: "en",
      p_items: items.slice(i, i + CHUNK) as unknown as Json,
    });
    if (error) throw new Error(error.message);
    queued += data;
  }
  console.log(`Đã xếp ${queued} việc mới (từ đã có hoặc đang chờ được bỏ qua).`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/pregenerate.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
