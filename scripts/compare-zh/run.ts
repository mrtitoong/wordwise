/**
 * So sánh model cho thẻ từ tiếng Trung (Z1, docs/plan-zh.md).
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/compare-zh/run.ts [--limit 2] [--only 看,的]
 *
 * Khóa API đọc từ .env.local. Kết quả từng từ lưu ở scripts/out/compare-zh/<model>/ nên chạy lại chỉ
 * làm phần còn thiếu; mỗi lần chạy in tổng hợp số từ đúng schema, cờ âm đọc và chi phí.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  MODEL_CATALOG,
  parseModelKeys,
  resolveLlmConfig,
  type ModelKey,
} from "../../src/config/llm";
import { allowedReadings, applyLexicon, parseLexicon } from "../../src/lib/lang/zh/lexicon";
import { ZhWordContentSchema, type ZhWordContent } from "../../src/lib/lang/zh/content-schema";
import {
  LlmExhaustedError,
  LlmSchemaError,
  createLlmRouter,
  createProviders,
  parsePromptTemplate,
  type LlmCallLog,
} from "../../src/lib/llm";
import { estimateCostUsd } from "../../src/lib/llm/cost";
import { buildZhWordContentPrompt } from "../../src/lib/llm/tasks/word-content-zh";
import { ZH_COMPARE_WORDS, type ZhCompareWord } from "./words";

const OUT = "scripts/out/compare-zh";
const PARALLEL = 4;

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: "claude-haiku,claude-sonnet" },
    limit: { type: "string" },
    only: { type: "string" },
  },
});

const template = parsePromptTemplate(readFileSync("src/prompts/word-content-zh.md", "utf8"));
const lexicon = parseLexicon(readFileSync("data/zh/lexicon.tsv", "utf8"));
const modelKeys = parseModelKeys(args.models!);
let words = ZH_COMPARE_WORDS;
if (args.only) words = words.filter((w) => args.only!.split(",").includes(w.lemma));
if (args.limit) words = words.slice(0, Number(args.limit));

export type ZhRecord = {
  lemma: string;
  status: "ok" | "invalid" | "error";
  data?: ZhWordContent;
  flags?: unknown[];
  issues?: unknown;
  error?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

const pathOf = (key: ModelKey, word: ZhCompareWord) =>
  join(OUT, key, `${[...word.lemma].map((c) => c.codePointAt(0)!.toString(16)).join("-")}.json`);

async function runOne(key: ModelKey, word: ZhCompareWord): Promise<ZhRecord> {
  const spec = MODEL_CATALOG[key];
  const logs: LlmCallLog[] = [];
  const router = createLlmRouter({
    config: { "word-content-zh": { ...resolveLlmConfig()["word-content-zh"], models: [spec] } },
    providers: createProviders({ [spec.provider]: process.env.ANTHROPIC_API_KEY }),
    logger: (entry) => {
      logs.push(entry);
    },
  });
  const readings = lexicon.get(word.lemma);
  const { system, prompt } = buildZhWordContentPrompt(template, {
    lemma: word.lemma,
    pos: word.pos,
    hsk: word.hsk,
    readings: allowedReadings(readings).map((r) => r.pinyin),
  });
  const stats = () => ({
    lemma: word.lemma,
    inputTokens: logs.at(-1)?.inputTokens ?? null,
    outputTokens: logs.at(-1)?.outputTokens ?? null,
    durationMs: logs.at(-1)?.durationMs ?? 0,
  });
  try {
    const result = await router.generateJSON("word-content-zh", {
      system,
      prompt,
      schema: ZhWordContentSchema,
      schemaRetries: 0,
    });
    const { content, flags } = applyLexicon(result.data, readings);
    return { ...stats(), status: "ok", data: content, flags };
  } catch (error) {
    const cause = error instanceof LlmExhaustedError ? error.lastError : error;
    if (cause instanceof LlmSchemaError) {
      return { ...stats(), status: "invalid", issues: cause.issues };
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ...stats(), status: "error", error: message };
  }
}

async function runModel(key: ModelKey) {
  mkdirSync(join(OUT, key), { recursive: true });
  const queue = words.filter((w) => !existsSync(pathOf(key, w)));
  console.log(`[${key}] cần chạy ${queue.length}/${words.length} từ`);
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (queue.length > 0) {
        const word = queue.shift()!;
        const record = await runOne(key, word);
        if (record.status !== "error") {
          writeFileSync(pathOf(key, word), JSON.stringify(record, null, 2));
        }
        const seconds = (record.durationMs / 1000).toFixed(1);
        console.log(`[${key}] ${word.lemma} ${record.status} ${seconds}s ${record.error ?? ""}`);
      }
    }),
  );
}

await Promise.all(modelKeys.map(runModel));

for (const key of modelKeys) {
  const records = words
    .filter((w) => existsSync(pathOf(key, w)))
    .map((w) => JSON.parse(readFileSync(pathOf(key, w), "utf8")) as ZhRecord);
  const ok = records.filter((r) => r.status === "ok");
  const input = records.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const output = records.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);
  const cost = estimateCostUsd(MODEL_CATALOG[key], { inputTokens: input, outputTokens: output });
  const flagged = ok.filter((r) => (r.flags ?? []).length > 0).map((r) => r.lemma);
  const seconds = ok.map((r) => r.durationMs / 1000).sort((a, b) => a - b);
  console.log(
    `${key}: đúng schema ${ok.length}/${records.length}, cờ âm đọc: ${flagged.join(" ") || "không"}, ` +
      `trung vị ${seconds[Math.floor(seconds.length / 2)]?.toFixed(0)}s, ` +
      `$${cost.toFixed(3)} (${records.length ? ((cost / records.length) * 1000).toFixed(1) : 0}/1.000 từ)`,
  );
}
