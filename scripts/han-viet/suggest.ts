/**
 * Gợi ý âm Hán Việt cho chữ HSK 1–3 rồi đối chiếu Unihan (docs/plan-zh.md §3 điểm 2).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/han-viet/suggest.ts <thư mục Unihan> <hsk30-charlist.txt>
 *
 * Kết quả ghi vào data/zh/han-viet-suggestions.json. Chạy lại thì chỉ làm chữ còn thiếu.
 * kVietnamese của Unihan lẫn cả âm Nôm nên chỉ để đối chiếu, không dùng thẳng.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MODEL_CATALOG, resolveLlmConfig } from "../../src/config/llm";
import { createLlmRouter, createProviders, parsePromptTemplate } from "../../src/lib/llm";
import { estimateCostUsd } from "../../src/lib/llm/cost";
import { renderTemplate } from "../../src/lib/llm/prompt-template";

const OUT = "data/zh/han-viet-suggestions.json";
const BATCH = 30;
const PARALLEL = 4;

export const HanVietBatchSchema = z.object({
  items: z.array(
    z.object({
      char: z.string().min(1),
      readings: z.array(z.object({ am: z.string().min(1), meaning_vi: z.string().min(1) })).max(3),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

type Item = z.infer<typeof HanVietBatchSchema>["items"][number];
export type Suggestion = Item & {
  level: number;
  traditional: string[];
  unihan: string[];
  /** khop: âm đầu có trong Unihan; lech: Unihan có âm khác; thieu: Unihan không có. */
  check: "khop" | "lech" | "thieu";
};

/** Chữ theo cấp trong bảng chữ HSK 3.0. */
export function readCharList(text: string): { char: string; level: number }[] {
  const out: { char: string; level: number }[] = [];
  let level = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("一级")) level = 1;
    else if (line.startsWith("二级")) level = 2;
    else if (line.startsWith("三级")) level = 3;
    else if (/^[四五六七]/.test(line)) level = 0;
    const char = line.split("\t")[1]?.trim();
    if (level > 0 && char && /^\p{Script=Han}$/u.test(char)) out.push({ char, level });
  }
  return out;
}

/** Hai cách bỏ dấu (hoà/hòa, thuỷ/thủy) là một âm. */
const PLACEMENT: Record<string, string> = {
  oà: "òa",
  oá: "óa",
  oả: "ỏa",
  oã: "õa",
  oạ: "ọa",
  oè: "òe",
  oé: "óe",
  oẻ: "ỏe",
  oẽ: "õe",
  oẹ: "ọe",
  uỳ: "ùy",
  uý: "úy",
  uỷ: "ủy",
  uỹ: "ũy",
  uỵ: "ụy",
};

const norm = (am: string) =>
  am
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/o[àáảãạèéẻẽẹ]|u[ỳýỷỹỵ]/g, (pair) => PLACEMENT[pair] ?? pair);

export function compare(readings: readonly { am: string }[], unihan: readonly string[]) {
  if (unihan.length === 0) return "thieu" as const;
  const first = readings[0]?.am;
  return first && unihan.map(norm).includes(norm(first)) ? ("khop" as const) : ("lech" as const);
}

function unihanField(dir: string, file: string, field: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [cp, name, value] = line.split("\t");
    if (name !== field || !cp || !value) continue;
    map.set(String.fromCodePoint(parseInt(cp.slice(2), 16)), value.trim());
  }
  return map;
}

if (process.argv[1]?.endsWith("suggest.ts")) {
  const [unihanDir, charList] = process.argv.slice(2);
  if (!unihanDir || !charList) throw new Error("Cần <thư mục Unihan> <hsk30-charlist.txt>");

  const viet = unihanField(unihanDir, "Unihan_Readings.txt", "kVietnamese");
  const variants = unihanField(unihanDir, "Unihan_Variants.txt", "kTraditionalVariant");
  const traditionalOf = (char: string) =>
    (variants.get(char) ?? "")
      .split(" ")
      .filter(Boolean)
      .map((u) => String.fromCodePoint(parseInt(u.slice(2).split("<")[0]!, 16)))
      .filter((c) => c !== char);
  const unihanOf = (char: string) => [
    ...new Set(
      [char, ...traditionalOf(char)].flatMap((c) => (viet.get(c) ?? "").split(" ").filter(Boolean)),
    ),
  ];

  const chars = readCharList(readFileSync(charList, "utf8"));
  const done = new Map<string, Suggestion>(
    existsSync(OUT)
      ? (JSON.parse(readFileSync(OUT, "utf8")) as Suggestion[]).map((s) => [s.char, s])
      : [],
  );
  const pending = chars.filter((c) => !done.has(c.char));
  console.log(`${chars.length} chữ, cần gợi ý ${pending.length}`);

  const template = parsePromptTemplate(readFileSync("src/prompts/han-viet.md", "utf8"));
  const spec = MODEL_CATALOG["claude-sonnet"];
  const router = createLlmRouter({
    config: { "han-viet": { ...resolveLlmConfig()["han-viet"], models: [spec] } },
    providers: createProviders({ claude: process.env.ANTHROPIC_API_KEY }),
  });

  const batches: (typeof chars)[] = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
  let cost = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (batches.length > 0) {
        const batch = batches.shift()!;
        const lines = batch.map(
          ({ char }) => `${char} (phồn thể: ${traditionalOf(char).join(" ") || char})`,
        );
        const result = await router.generateJSON("han-viet", {
          system: renderTemplate(template.system, {}),
          prompt: renderTemplate(template.user, { chars: lines.join("\n") }),
          schema: HanVietBatchSchema,
        });
        cost += estimateCostUsd(spec, result.usage);
        for (const item of result.data.items) {
          const source = batch.find((c) => c.char === item.char);
          if (!source) continue;
          const unihan = unihanOf(item.char);
          done.set(item.char, {
            ...item,
            level: source.level,
            traditional: traditionalOf(item.char),
            unihan,
            check: compare(item.readings, unihan),
          });
        }
        console.log(`xong ${done.size}/${chars.length}`);
      }
    }),
  );

  const list = chars.flatMap((c) => done.get(c.char) ?? []);
  writeFileSync(OUT, JSON.stringify(list, null, 1) + "\n");
  const count = (check: Suggestion["check"]) => list.filter((s) => s.check === check).length;
  console.log(
    `Đã ghi ${list.length}/${chars.length} chữ: khớp ${count("khop")}, lệch ${count("lech")}, ` +
      `thiếu ${count("thieu")}, không có âm ${list.filter((s) => s.readings.length === 0).length}, ` +
      `$${cost.toFixed(3)}`,
  );
}
