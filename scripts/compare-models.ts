/**
 * So sánh model cho tác vụ word-content (Prompt 2.0).
 *
 * Chạy: npm run compare:models -- [--models gemini-flash,claude-haiku,claude-sonnet]
 *                                  [--limit 5] [--only resilient] [--report-only]
 * Khóa API đọc từ .env.local (GEMINI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY), chỉ dùng
 * trên máy dev. Kết quả từng từ lưu ở scripts/out/compare/<model>/ nên chạy lại sẽ tiếp tục
 * phần còn thiếu (hữu ích khi gói miễn phí Gemini hết lượt trong ngày).
 * Trang so sánh: scripts/out/compare-models.html.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { MODEL_CATALOG, parseModelKeys, type ModelKey } from "../src/config/llm";
import {
  LlmExhaustedError,
  LlmSchemaError,
  createLlmRouter,
  createProviders,
  parsePromptTemplate,
  type LlmCallLog,
} from "../src/lib/llm";
import { buildWordContentPrompt } from "../src/lib/llm/tasks/word-content";
import { WordContentSchema } from "../src/lib/schema/word";
import { renderReport, type RunRecord } from "./compare-models/report";
import { loadCompareWords, wordId, type CompareWord } from "./compare-models/words";

const OUT_DIR = "scripts/out";
const CACHE_DIR = join(OUT_DIR, "compare");
const DEFAULT_MODELS = "gemini-flash,claude-haiku,claude-sonnet";
/** Số từ chạy song song mỗi model; gói miễn phí chạy lần lượt để đỡ bị 429. */
const CONCURRENCY: Record<string, number> = { gemini: 1, groq: 1, claude: 4 };

const { values: args } = parseArgs({
  options: {
    models: { type: "string", default: DEFAULT_MODELS },
    limit: { type: "string" },
    only: { type: "string" },
    "report-only": { type: "boolean", default: false },
  },
});

const modelKeys = parseModelKeys(args.models!);
const template = parsePromptTemplate(readFileSync("src/prompts/word-content.md", "utf8"));
let words = loadCompareWords();
if (args.only) words = words.filter((w) => args.only!.split(",").includes(w.lemma));
if (args.limit) words = words.slice(0, Number(args.limit));

const KEY_ENV = { gemini: "GEMINI_API_KEY", claude: "ANTHROPIC_API_KEY", groq: "GROQ_API_KEY" };

function cachePath(modelKey: ModelKey, word: CompareWord) {
  return join(CACHE_DIR, modelKey, `${wordId(word)}.json`);
}

function readCached(modelKey: ModelKey, word: CompareWord): RunRecord | null {
  const path = cachePath(modelKey, word);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RunRecord) : null;
}

async function runOne(modelKey: ModelKey, word: CompareWord): Promise<RunRecord> {
  const spec = MODEL_CATALOG[modelKey];
  const logs: LlmCallLog[] = [];
  const router = createLlmRouter({
    config: { "word-content": { containsUserData: false, models: [spec] } },
    providers: createProviders({ [spec.provider]: process.env[KEY_ENV[spec.provider]] }),
    logger: (entry) => {
      logs.push(entry);
    },
  });
  const { system, prompt } = buildWordContentPrompt(template, {
    language: "en",
    lemma: word.lemma,
    pos: word.pos,
    cefrLevel: word.cefr,
  });

  const base = { modelKey, lemma: word.lemma, pos: word.pos, promptVersion: template.version };
  const last = () => logs.at(-1);
  const stats = () => ({
    inputTokens: last()?.inputTokens ?? null,
    outputTokens: last()?.outputTokens ?? null,
    durationMs: last()?.durationMs ?? 0,
    rateLimitHits: logs.filter((l) => l.outcome === "rate_limited").length,
    at: new Date().toISOString(),
  });

  try {
    const result = await router.generateJSON("word-content", {
      system,
      prompt,
      schema: WordContentSchema,
      schemaRetries: 0,
    });
    return { ...base, status: "ok", data: result.data, ...stats() };
  } catch (error) {
    const cause = error instanceof LlmExhaustedError ? error.lastError : error;
    if (cause instanceof LlmSchemaError) {
      return {
        ...base,
        status: "invalid",
        raw: cause.rawText,
        issues: cause.issues,
        ...stats(),
      };
    }
    return {
      ...base,
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
      ...stats(),
    };
  }
}

async function runModel(modelKey: ModelKey) {
  const spec = MODEL_CATALOG[modelKey];
  if (!process.env[KEY_ENV[spec.provider]]) {
    console.warn(`[${modelKey}] bỏ qua: chưa có ${KEY_ENV[spec.provider]} trong .env.local`);
    return;
  }
  mkdirSync(join(CACHE_DIR, modelKey), { recursive: true });
  const queue = words.filter((w) => {
    const cached = readCached(modelKey, w);
    return !cached || cached.status === "error";
  });
  console.log(`[${modelKey}] cần chạy ${queue.length}/${words.length} từ`);
  let quotaExhausted = false;

  async function worker() {
    while (queue.length > 0 && !quotaExhausted) {
      const word = queue.shift()!;
      const record = await runOne(modelKey, word);
      writeFileSync(cachePath(modelKey, word), JSON.stringify(record, null, 2));
      const mark = { ok: "✓", invalid: "✗ sai schema", error: "! lỗi" }[record.status];
      console.log(
        `[${modelKey}] ${word.lemma} (${word.pos}) ${mark} ${(record.durationMs / 1000).toFixed(1)}s` +
          (record.error ? ` – ${record.error.slice(0, 160)}` : ""),
      );
      // Bị 429 suốt cả chuỗi thử lại → nhiều khả năng hết lượt trong ngày.
      if (record.status === "error" && record.rateLimitHits > 5) {
        quotaExhausted = true;
        console.warn(`[${modelKey}] có vẻ đã hết lượt gọi, dừng model này. Chạy lại sau.`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY[spec.provider] ?? 1 }, worker));
}

function loadAllRecords(): RunRecord[] {
  if (!existsSync(CACHE_DIR)) return [];
  return readdirSync(CACHE_DIR).flatMap((dir) =>
    readdirSync(join(CACHE_DIR, dir))
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(CACHE_DIR, dir, file), "utf8")) as RunRecord),
  );
}

if (!args["report-only"]) {
  await Promise.all(modelKeys.map(runModel));
}

const allWords = loadCompareWords();
const html = renderReport({
  words: allWords,
  modelKeys,
  records: loadAllRecords().filter((r) => modelKeys.includes(r.modelKey)),
  promptVersion: template.version,
  generatedAt: new Date(),
});
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "compare-models.html"), html);
console.log(`Đã ghi ${join(OUT_DIR, "compare-models.html")}`);
