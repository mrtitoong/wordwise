// File sinh tự động từ src/functions/admin-word/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/admin-word/main.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// src/lib/llm/errors.ts
var LlmProviderError = class extends Error {
  constructor(message, provider, rateLimited, retryable, status) {
    super(message);
    this.provider = provider;
    this.rateLimited = rateLimited;
    this.retryable = retryable;
    this.status = status;
    this.name = "LlmProviderError";
  }
  provider;
  rateLimited;
  retryable;
  status;
};
var LlmPolicyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LlmPolicyError";
  }
};
var LlmSchemaError = class extends Error {
  constructor(message, rawText, issues) {
    super(message);
    this.rawText = rawText;
    this.issues = issues;
    this.name = "LlmSchemaError";
  }
  rawText;
  issues;
};
var LlmExhaustedError = class extends Error {
  constructor(task, lastError) {
    super(
      `Tác vụ ${task}: mọi model đều lỗi (${lastError instanceof Error ? lastError.message : String(lastError)})`
    );
    this.task = task;
    this.lastError = lastError;
    this.name = "LlmExhaustedError";
  }
  task;
  lastError;
};

// src/lib/llm/policy.ts
function assertModelAllowed(task, config, model) {
  if (config.containsUserData && model.freeTier) {
    throw new LlmPolicyError(
      `Tác vụ "${task}" chứa dữ liệu người dùng nhưng cấu hình dùng gói miễn phí ${model.provider}:${model.model}. Chỉ dùng nhà cung cấp trả phí cho tác vụ này.`
    );
  }
}
function validateLlmConfig(config) {
  for (const [task, taskConfig] of Object.entries(config)) {
    if (taskConfig.models.length === 0) {
      throw new LlmPolicyError(`Tác vụ "${task}" chưa có model nào.`);
    }
    for (const model of taskConfig.models) assertModelAllowed(task, taskConfig, model);
  }
}

// src/config/llm.ts
var MODEL_CATALOG = {
  "gemini-flash": {
    provider: "gemini",
    model: "gemini-3.8-flash",
    freeTier: true,
    reasoning: "medium",
    maxOutputTokens: 16e3,
    // Giá trả phí giới thiệu đến hết 2026 (tham khảo; gói miễn phí không mất tiền).
    priceUsdPerMTok: { input: 0.75, output: 3.75 }
  },
  "claude-haiku": {
    provider: "claude",
    model: "claude-haiku-5-5",
    freeTier: false,
    reasoning: "medium",
    maxOutputTokens: 16e3,
    priceUsdPerMTok: { input: 0.1, output: 0.5 }
  },
  "claude-sonnet": {
    provider: "claude",
    model: "claude-sonnet-5-5",
    freeTier: false,
    reasoning: "medium",
    maxOutputTokens: 16e3,
    priceUsdPerMTok: { input: 2, output: 10 }
  },
  "groq-gpt-oss": {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    freeTier: true,
    reasoning: "medium",
    maxOutputTokens: 16e3,
    priceUsdPerMTok: { input: 0.15, output: 0.6 }
  }
};
var LLM_TASKS = [
  "word-content",
  "example-generator",
  "mnemonic",
  "photo-word-picker",
  "list-analyzer",
  "list-triage",
  "sense-picker",
  "list-subtopics",
  "reverse-lookup",
  "photo-ocr"
];
var DEFAULT_TASKS = {
  // Kiến thức chung → Claude Haiku, dự phòng Sonnet (chốt 2026-10-20 sau so sánh 50 từ:
  // Haiku 49/50 đúng schema, ~$3.8/1.000 từ; Gemini gói miễn phí chỉ ~20 lượt/ngày, 80–130 s/từ).
  // Schema thẻ từ 5 tab quá lớn để Claude/Gemini biên dịch thành structured output
  // (Claude 400 "compiled grammar is too large", Gemini 400) → gửi trong prompt.
  "word-content": {
    containsUserData: false,
    models: ["claude-haiku", "claude-sonnet"],
    schemaMode: "prompt"
  },
  "example-generator": { containsUserData: false, models: ["claude-haiku", "claude-sonnet"] },
  mnemonic: { containsUserData: false, models: ["claude-haiku", "claude-sonnet"] },
  // Ảnh/văn bản OCR của người dùng, bài đọc Admin → chỉ trả phí.
  "photo-word-picker": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] },
  "list-analyzer": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] },
  // Phân tích danh sách Admin (Prompt 7.2): việc nhỏ, nhiều lượt → Haiku, dự phòng Sonnet.
  // Ước lượng CEFR/chính tả và chia chủ đề con chỉ gửi từ + nghĩa; chọn nghĩa gửi câu trong bài
  // đọc của Admin nên vẫn đánh dấu containsUserData (chỉ model trả phí).
  "list-triage": { containsUserData: true, models: ["claude-haiku", "claude-sonnet"] },
  "sense-picker": { containsUserData: true, models: ["claude-haiku", "claude-sonnet"] },
  "list-subtopics": { containsUserData: true, models: ["claude-haiku", "claude-sonnet"] },
  // Câu tiếng Việt người dùng nói/gõ để tra ngược (Prompt 2.5) → chỉ trả phí.
  "reverse-lookup": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] },
  // Đọc chữ trên ảnh người dùng chụp khi Google Cloud Vision đọc kém (Prompt 2.6) → chỉ trả phí.
  "photo-ocr": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] }
};
function envKeyForTask(task) {
  return `LLM_MODELS_${task.toUpperCase().replaceAll("-", "_")}`;
}
function parseModelKeys(value) {
  const keys = value.split(",").map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("Danh sách model rỗng");
  for (const key of keys) {
    if (!(key in MODEL_CATALOG)) {
      throw new Error(
        `Model "${key}" không có trong MODEL_CATALOG (${Object.keys(MODEL_CATALOG).join(", ")})`
      );
    }
  }
  return keys;
}
function resolveLlmConfig(env = {}) {
  const config = {};
  for (const task of LLM_TASKS) {
    const defaults = DEFAULT_TASKS[task];
    const override = env[envKeyForTask(task)];
    const keys = override ? parseModelKeys(override) : defaults.models;
    config[task] = {
      containsUserData: defaults.containsUserData,
      models: keys.map((key) => MODEL_CATALOG[key]),
      ...defaults.schemaMode ? { schemaMode: defaults.schemaMode } : {}
    };
  }
  validateLlmConfig(config);
  return config;
}

// src/config/words.ts
var SHARED_CONTENT_CEFR = "B1";

// src/lib/llm/log-row.ts
function toLlmCallLogRow(entry) {
  return {
    task: entry.task,
    provider: entry.provider,
    model: entry.model,
    attempt: entry.attempt,
    outcome: entry.outcome,
    is_fallback: entry.isFallback,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    duration_ms: Math.round(entry.durationMs),
    error: entry.error
  };
}

// src/lib/llm/prompt-template.ts
var SYSTEM_MARK = "=== SYSTEM ===";
var USER_MARK = "=== USER ===";
function parsePromptTemplate(markdown) {
  const source = markdown.replaceAll("\r\n", "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!front) throw new Error("Prompt thiếu phần đầu (front matter)");
  const meta = Object.fromEntries(
    front[1].split("\n").flatMap((line) => {
      const match = /^(\w+):\s*(.*)$/.exec(line);
      return match ? [[match[1], match[2].trim()]] : [];
    })
  );
  const version = Number(meta.version);
  if (!meta.task || !Number.isInteger(version)) {
    throw new Error("Prompt cần task và version (số nguyên)");
  }
  const body = source.slice(front[0].length).replace(/<!--[\s\S]*?-->/g, "");
  const systemAt = body.indexOf(SYSTEM_MARK);
  const userAt = body.indexOf(USER_MARK);
  if (systemAt < 0 || userAt < systemAt) {
    throw new Error(`Prompt cần "${SYSTEM_MARK}" rồi "${USER_MARK}"`);
  }
  return {
    task: meta.task,
    version,
    system: body.slice(systemAt + SYSTEM_MARK.length, userAt).trim(),
    user: body.slice(userAt + USER_MARK.length).trim()
  };
}
function renderTemplate(template2, vars) {
  return template2.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const value = vars[name];
    if (value === void 0) throw new Error(`Thiếu biến {{${name}}} trong prompt`);
    return value;
  });
}

// src/lib/llm/providers/claude.ts
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
var SERVER_FALLBACK_MODELS = /* @__PURE__ */ new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
function createClaudeProvider(options) {
  const client = "client" in options ? options.client : new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  const provider = {
    id: "claude",
    async generate({
      model,
      system,
      prompt,
      jsonSchema,
      schemaMode,
      images
    }) {
      const serverFallback = SERVER_FALLBACK_MODELS.has(model.model);
      let response;
      try {
        response = await client.beta.messages.create({
          model: model.model,
          max_tokens: model.maxOutputTokens,
          system,
          messages: [
            {
              role: "user",
              content: images?.length ? [
                ...images.map((image) => ({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mediaType,
                    data: image.data
                  }
                })),
                { type: "text", text: prompt }
              ] : prompt
            }
          ],
          output_config: {
            ...schemaMode === "enforce" ? { format: { type: "json_schema", schema: toClaudeJsonSchema(jsonSchema) } } : {},
            ...model.reasoning ? { effort: model.reasoning } : {}
          },
          ...serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}
        });
      } catch (error) {
        throw mapClaudeError(error);
      }
      if (response.stop_reason === "refusal") {
        throw new LlmProviderError(
          `Claude từ chối (${response.stop_details?.category ?? "không rõ"})`,
          "claude",
          false,
          false
        );
      }
      const text3 = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
      return {
        text: text3,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    }
  };
  return provider;
}
function mapClaudeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmProviderError(message, "claude", true, true, 429);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmProviderError(message, "claude", false, true);
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    const retryable = typeof status === "number" && status >= 500;
    return new LlmProviderError(message, "claude", false, retryable, status);
  }
  return new LlmProviderError(message, "claude", false, false);
}
var STRING_FORMATS = /* @__PURE__ */ new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid"
]);
function toClaudeJsonSchema(schema) {
  if (Array.isArray(schema.type)) {
    const { description, title, ...rest } = schema;
    return {
      ...description !== void 0 ? { description } : {},
      ...title !== void 0 ? { title } : {},
      anyOf: schema.type.map(
        (type) => type === "null" ? { type } : toClaudeJsonSchema({ ...rest, type })
      )
    };
  }
  const out = {};
  for (const key of ["description", "title", "enum", "const", "$ref", "required"]) {
    if (schema[key] !== void 0) out[key] = schema[key];
  }
  if (schema.$defs) out.$defs = mapValues(schema.$defs);
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union)) out.anyOf = union.map((s) => toClaudeJsonSchema(s));
  if (Array.isArray(schema.allOf)) {
    out.allOf = schema.allOf.map((s) => toClaudeJsonSchema(s));
  }
  if (schema.type !== void 0) out.type = schema.type;
  if (schema.type === "object") {
    out.properties = mapValues(schema.properties ?? {});
    out.additionalProperties = false;
  } else if (schema.type === "array") {
    if (schema.items) out.items = toClaudeJsonSchema(schema.items);
    if (schema.minItems === 0 || schema.minItems === 1) out.minItems = schema.minItems;
  } else if (schema.type === "string") {
    if (typeof schema.format === "string" && STRING_FORMATS.has(schema.format)) {
      out.format = schema.format;
    }
  }
  return out;
}
function mapValues(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, toClaudeJsonSchema(value)])
  );
}

// src/lib/llm/router.ts
import { z } from "npm:zod@4.6.5";

// src/lib/llm/retry.ts
var MAX_RATE_LIMIT_RETRIES = 5;
var BASE_DELAY_MS = 1e3;
var MAX_DELAY_MS = 6e4;
function backoffDelayMs(retry) {
  return Math.min(BASE_DELAY_MS * 2 ** (retry - 1), MAX_DELAY_MS);
}

// src/lib/llm/router.ts
var DEFAULT_SCHEMA_RETRIES = 2;
var MAX_ERROR_LENGTH = 2e3;
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function createLlmRouter(deps) {
  validateLlmConfig(deps.config);
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  async function log(entry) {
    if (!deps.logger) return;
    try {
      await deps.logger(entry);
    } catch {
    }
  }
  return {
    async generateJSON(task, { system, prompt, schema, schemaRetries, preprocess, images }) {
      const taskConfig = deps.config[task];
      const jsonSchema = toJsonSchema(schema);
      const schemaMode = taskConfig.schemaMode ?? "enforce";
      const fullPrompt = schemaMode === "prompt" ? `${prompt}

${schemaInstruction(jsonSchema)}` : prompt;
      const maxSchemaRetries = schemaRetries ?? DEFAULT_SCHEMA_RETRIES;
      let lastError = new Error("chưa gọi model nào");
      for (const [index, model] of taskConfig.models.entries()) {
        assertModelAllowed(task, taskConfig, model);
        const isFallback = index > 0;
        const provider = deps.providers[model.provider];
        if (!provider) {
          lastError = new LlmProviderError(
            `Chưa cấu hình khóa API cho ${model.provider}`,
            model.provider,
            false,
            false
          );
          continue;
        }
        let rateRetries = 0;
        let schemaFailures = 0;
        for (let attempt = 1; ; attempt++) {
          const base2 = { task, provider: model.provider, model: model.model, attempt, isFallback };
          const started = now();
          let text3;
          let usage;
          try {
            ({ text: text3, usage } = await provider.generate({
              model,
              system,
              prompt: fullPrompt,
              jsonSchema,
              schemaMode,
              ...images?.length ? { images } : {}
            }));
          } catch (error) {
            if (error instanceof LlmPolicyError) throw error;
            const providerError = toProviderError(error, model.provider);
            await log({
              ...base2,
              outcome: providerError.rateLimited ? "rate_limited" : "error",
              inputTokens: null,
              outputTokens: null,
              durationMs: now() - started,
              error: truncate(providerError.message)
            });
            lastError = providerError;
            if (providerError.retryable && rateRetries < MAX_RATE_LIMIT_RETRIES) {
              rateRetries++;
              await sleep(backoffDelayMs(rateRetries));
              continue;
            }
            break;
          }
          const durationMs = now() - started;
          const parsed = parseJson(text3, schema, preprocess);
          if (!parsed.ok) {
            await log({
              ...base2,
              outcome: "schema_invalid",
              ...usage,
              durationMs,
              error: truncate(parsed.error.message + ": " + parsed.error.issues.join("; "))
            });
            lastError = parsed.error;
            if (schemaFailures < maxSchemaRetries) {
              schemaFailures++;
              continue;
            }
            break;
          }
          await log({ ...base2, outcome: "ok", ...usage, durationMs, error: null });
          return { data: parsed.data, model, usage, isFallback };
        }
      }
      throw new LlmExhaustedError(task, lastError);
    }
  };
}
function toJsonSchema(schema) {
  const json2 = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  delete json2.$schema;
  return json2;
}
function schemaInstruction(jsonSchema) {
  return "Trả về DUY NHẤT một đối tượng JSON hợp lệ theo JSON Schema dưới đây (không markdown, không giải thích). Tôn trọng mọi ràng buộc: enum, minItems/maxItems, minLength, giá trị null cho phép.\n" + JSON.stringify(jsonSchema);
}
function parseJson(text3, schema, preprocess) {
  let raw;
  try {
    raw = JSON.parse(stripCodeFence(text3));
  } catch (error) {
    const object = firstJsonObject(text3);
    if (object !== null) {
      try {
        raw = JSON.parse(object);
      } catch {
      }
    }
    if (raw === void 0) {
      return {
        ok: false,
        error: new LlmSchemaError("Không parse được JSON", text3, [
          error instanceof Error ? error.message : String(error)
        ])
      };
    }
  }
  const result = schema.safeParse(preprocess ? preprocess(raw) : raw);
  if (!result.success) {
    return {
      ok: false,
      error: new LlmSchemaError(
        "Sai schema",
        text3,
        result.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`)
      )
    };
  }
  return { ok: true, data: result.data };
}
function firstJsonObject(text3) {
  const start = text3.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text3.length; i++) {
    const char = text3[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text3.slice(start, i + 1);
  }
  return null;
}
function stripCodeFence(text3) {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text3);
  return match ? match[1] : text3;
}
function toProviderError(error, provider) {
  if (error instanceof LlmProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LlmProviderError(message, provider, false, false);
}
function truncate(text3) {
  return text3.length > MAX_ERROR_LENGTH ? text3.slice(0, MAX_ERROR_LENGTH - 1) + "…" : text3;
}

// src/lib/llm/tasks/word-content.ts
var LANGUAGE_NAMES = {
  en: "tiếng Anh",
  ja: "tiếng Nhật",
  zh: "tiếng Trung",
  ko: "tiếng Hàn",
  fr: "tiếng Pháp"
};
function buildWordContentPrompt(template2, request) {
  if (template2.task !== "word-content") {
    throw new Error(`Cần prompt word-content, nhận ${template2.task}`);
  }
  const { language, lemma, pos, cefrLevel, dictionary } = request;
  const vars = {
    language,
    language_name: LANGUAGE_NAMES[language],
    lemma: lemma.trim(),
    pos_label: pos ?? "chưa chỉ định",
    // Không ghi loại từ → model chọn loại phổ biến nhất. Không lấy theo thứ tự từ điển:
    // Wiktionary xếp theo nguồn gốc, không theo tần suất ("and" ra danh từ, "by" ra cricket).
    pos_rule: pos ? `pos = "${pos}".` : `pos: chọn MỘT loại từ phổ biến nhất của "${lemma.trim()}" trong tiếng Anh hiện đại (vd "and" → conjunction, "find" → verb, "at" → preposition). Không chọn loại từ hiếm, cổ hoặc chuyên ngành chỉ vì từ điển liệt kê trước.`,
    cefr_level: cefrLevel,
    dictionary_json: dictionary === void 0 ? "{}" : JSON.stringify(dictionary)
  };
  return {
    system: renderTemplate(template2.system, vars),
    prompt: renderTemplate(template2.user, vars),
    promptVersion: template2.version
  };
}

// src/lib/schema/word.ts
import { z as z2 } from "npm:zod@4.6.5";
var SCHEMA_VERSION = 1;
var text = z2.string().trim().min(1);
var LanguageSchema = z2.enum(["en", "ja", "zh", "ko", "fr"]);
var CefrSchema = z2.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
var PosSchema = z2.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "phrasal_verb",
  "phrase"
]);
var RegisterSchema = z2.enum(["formal", "neutral", "informal", "slang", "offensive"]);
var ipaText = text.refine((s) => !s.includes("/"), {
  message: "IPA không kèm dấu '/'"
});
var IpaSchema = z2.object({
  us: ipaText.nullable(),
  uk: ipaText.nullable()
});
var InflectionSchema = z2.object({
  label: z2.enum([
    "plural",
    "third_person",
    "past",
    "past_participle",
    "present_participle",
    "comparative",
    "superlative"
  ]),
  form: text,
  irregular: z2.boolean()
});
var SpellingVariantSchema = z2.object({
  form: text,
  region: z2.enum(["us", "uk"]),
  note_vi: text.nullable()
});
var FormsSchema = z2.object({
  inflections: z2.array(InflectionSchema).max(12),
  /** Biến thể Anh–Mỹ của chính từ này (colour/color). */
  variants: z2.array(SpellingVariantSchema).max(4)
});
var ExampleSchema = z2.object({
  sentence: text,
  translation_vi: text,
  /** Đúng dạng từ xuất hiện trong câu (vd "ran"), để UI tô đậm và tạo câu điền từ. */
  highlight: text
}).refine((e) => e.sentence.toLowerCase().includes(e.highlight.toLowerCase()), {
  message: "highlight phải xuất hiện trong sentence",
  path: ["highlight"]
});
var SynonymSchema = z2.object({
  word: text,
  nuance_vi: text
});
var AntonymSchema = z2.object({
  word: text
});
var HomonymSchema = z2.object({
  word: text,
  /** homograph: viết giống (bat – con dơi/gậy); homophone: đọc giống (pair/pear). */
  kind: z2.enum(["homograph", "homophone"]),
  meaning_vi: text
});
var WordFamilyMemberSchema = z2.object({
  word: text,
  pos: PosSchema,
  note_vi: text.nullable()
});
var CollocationSchema = z2.object({
  /** Mẫu cấu trúc, vd "adverb + adjective", "verb + noun". */
  pattern: text,
  /** Cụm từ, vd "remarkably resilient". */
  phrase: text,
  example: text.nullable()
});
var IdiomSchema = z2.object({
  phrase: text,
  meaning_vi: text,
  register: RegisterSchema,
  example: text.nullable()
});
var CommonMistakeSchema = z2.object({
  wrong: text,
  correct: text,
  explanation_vi: text
});
var MnemonicSchema = z2.object({
  type: z2.enum(["sound", "etymology", "image", "story"]),
  text_vi: text
});
var ConfusableSchema = z2.object({
  word: text,
  difference_vi: text
});
var FuriganaSegmentSchema = z2.object({
  text,
  /** Cách đọc kana cho đoạn có kanji; null nếu đoạn đã là kana. */
  reading: text.nullable()
});
var JapaneseExtraSchema = z2.object({
  kind: z2.literal("ja"),
  reading_kana: text,
  furigana: z2.array(FuriganaSegmentSchema).min(1),
  pitch_accent: z2.number().int().min(0).nullable(),
  jlpt: z2.enum(["N5", "N4", "N3", "N2", "N1"]).nullable()
});
var ChineseExtraSchema = z2.object({
  kind: z2.literal("zh"),
  simplified: text,
  traditional: text.nullable(),
  /** Pinyin có dấu, vd "nǔ lì". */
  pinyin: text,
  /** Thanh điệu từng âm tiết: 1–4, 5 = thanh nhẹ. */
  tones: z2.array(z2.number().int().min(1).max(5)).min(1),
  hsk: z2.number().int().min(1).max(9).nullable()
});
var LanguageExtraSchema = z2.discriminatedUnion("kind", [
  JapaneseExtraSchema,
  ChineseExtraSchema
]);
var SenseSchema = z2.object({
  definition_en: text,
  meaning_vi: text,
  /** 2–4 từ tiếng Anh mô tả hình ảnh cụ thể để tìm ảnh gợi nhớ. */
  image_query: text,
  examples: z2.array(ExampleSchema).min(1).max(5),
  synonyms: z2.array(SynonymSchema).max(8),
  antonyms: z2.array(AntonymSchema).max(6),
  collocations: z2.array(CollocationSchema).max(8),
  idioms: z2.array(IdiomSchema).max(6),
  common_mistakes: z2.array(CommonMistakeSchema).max(3)
});
var score = z2.number().min(0).max(1);
var ConfidenceSchema = z2.object({
  collocations: score,
  idioms: score,
  mnemonics: score
});
var WordContentSchema = z2.object({
  schema_version: z2.literal(SCHEMA_VERSION),
  language: LanguageSchema,
  lemma: text,
  pos: PosSchema,
  ipa: IpaSchema,
  cefr: CefrSchema,
  register: RegisterSchema,
  etymology_vi: text.nullable(),
  forms: FormsSchema,
  /** Sắp theo tần suất sử dụng, phổ biến nhất trước. */
  senses: z2.array(SenseSchema).min(1).max(5),
  homonyms: z2.array(HomonymSchema).max(4),
  word_family: z2.array(WordFamilyMemberSchema).max(10),
  mnemonics: z2.array(MnemonicSchema).max(3),
  confusables: z2.array(ConfusableSchema).max(4),
  confidence: ConfidenceSchema,
  /** null với tiếng Anh; với ja/zh, `kind` phải trùng `language`. */
  language_extra: LanguageExtraSchema.nullable()
}).superRefine((w, ctx) => {
  if (w.language_extra && w.language_extra.kind !== w.language) {
    ctx.addIssue({
      code: "custom",
      path: ["language_extra", "kind"],
      message: `language_extra.kind (${w.language_extra.kind}) phải trùng language (${w.language})`
    });
  }
  if (w.language === "en" && w.ipa.us === null && w.ipa.uk === null) {
    ctx.addIssue({
      code: "custom",
      path: ["ipa"],
      message: "Tiếng Anh cần ít nhất một IPA (us hoặc uk)"
    });
  }
});

// src/lib/dictionary/free-dictionary.ts
import { z as z3 } from "npm:zod@4.6.5";
var ResponseSchema = z3.array(
  z3.object({
    meanings: z3.array(
      z3.object({
        partOfSpeech: z3.string(),
        definitions: z3.array(z3.object({ definition: z3.string() })).default([])
      })
    ).default([])
  })
);

// src/lib/schema/word-rows.ts
import { z as z4 } from "npm:zod@4.6.5";
var WordDetailsColumnSchema = z4.object({
  etymology_vi: z4.string().nullable(),
  homonyms: z4.array(HomonymSchema),
  word_family: z4.array(WordFamilyMemberSchema),
  mnemonics: z4.array(MnemonicSchema),
  confusables: z4.array(ConfusableSchema),
  confidence: ConfidenceSchema,
  language_extra: LanguageExtraSchema.nullable()
});
function fromWordRows(rows) {
  const wordDetails = WordDetailsColumnSchema.parse(rows.word.details);
  const detailBySense = new Map(rows.details.map((d) => [d.sense_id, d]));
  const senses = [...rows.senses].sort((a, b) => a.sense_order - b.sense_order).map((sense) => {
    const d = detailBySense.get(sense.id);
    if (!d) throw new Error(`Thiếu word_details cho sense ${sense.id}`);
    return {
      definition_en: sense.definition_en,
      meaning_vi: sense.meaning_vi,
      image_query: sense.image_query,
      examples: d.examples,
      synonyms: d.synonyms,
      antonyms: d.antonyms,
      collocations: d.collocations,
      idioms: d.idioms,
      common_mistakes: d.common_mistakes
    };
  });
  return WordContentSchema.parse({
    schema_version: rows.word.schema_version,
    language: rows.word.language,
    lemma: rows.word.lemma,
    pos: rows.word.pos,
    ipa: { us: rows.word.ipa_us, uk: rows.word.ipa_uk },
    cefr: rows.word.cefr,
    register: rows.word.register,
    etymology_vi: wordDetails.etymology_vi,
    forms: rows.word.forms,
    senses,
    homonyms: wordDetails.homonyms,
    word_family: wordDetails.word_family,
    mnemonics: wordDetails.mnemonics,
    confusables: wordDetails.confusables,
    confidence: wordDetails.confidence,
    language_extra: wordDetails.language_extra
  });
}

// src/lib/words/api.ts
import { z as z6 } from "npm:zod@4.6.5";

// src/lib/words/reverse.ts
import { z as z5 } from "npm:zod@4.6.5";
var ReverseRequestSchema = z5.object({
  action: z5.literal("reverse"),
  query: z5.string().trim().min(2).max(60)
});
var ReverseItemSchema = z5.object({
  word: z5.string(),
  pos: PosSchema.nullable(),
  /** Nghĩa tiếng Việt trong kho (null với gợi ý của AI chưa có trong kho). */
  meaning: z5.string().nullable(),
  /** Sắc thái do AI giải thích. */
  nuance: z5.string().nullable(),
  wordId: z5.string().nullable(),
  source: z5.enum(["library", "ai"])
});
var ReverseResponseSchema = z5.object({
  items: z5.array(ReverseItemSchema),
  /** Trạng thái phần AI: skipped (kho đã đủ), used, login_required, limit_reached, unavailable. */
  ai: z5.enum(["skipped", "used", "login_required", "limit_reached", "unavailable"])
});

// src/lib/words/api.ts
var InputMethodSchema = z6.enum(["typed", "voice", "photo", "csv", "list"]);
var WordRequestSchema = z6.object({
  action: z6.literal("request").default("request"),
  lemma: z6.string().trim().min(1).max(64),
  language: LanguageSchema.default("en"),
  pos: PosSchema.nullish(),
  /** Từ chưa có trong kho: máy chủ tự thêm nghĩa phổ biến nhất vào sổ này khi tạo xong. */
  notebookId: z6.uuid().nullish(),
  contextSentence: z6.string().trim().max(500).nullish(),
  /** Ảnh chụp người dùng giữ làm ngữ cảnh (storage://user-images/{user_id}/…). */
  contextImageUrl: z6.string().max(300).regex(/^storage:\/\/user-images\/[0-9a-f-]{36}\/[\w.-]+$/).nullish(),
  inputMethod: InputMethodSchema.nullish(),
  /** Ghi chú riêng (cột nghĩa/ghi chú của file) → "Ghi chú của bạn" ở tab Nghĩa. */
  note: z6.string().trim().max(500).nullish(),
  /** Tag của từ trong sổ (gom nhóm khi nhập file). */
  tags: z6.array(z6.string().trim().min(1).max(30)).max(10).nullish()
});
var WorkerRequestSchema = z6.object({ action: z6.literal("work") });
var ResolveRequestSchema = z6.object({
  action: z6.literal("resolve"),
  lemmas: z6.array(z6.string().trim().min(1).max(64)).min(1).max(50),
  language: LanguageSchema.default("en")
});
var FunctionRequestSchema = z6.union([
  WorkerRequestSchema,
  ResolveRequestSchema,
  ReverseRequestSchema,
  WordRequestSchema
]);
var ImageCreditSchema = z6.object({
  provider: z6.enum(["pexels", "unsplash"]),
  author: z6.string(),
  author_url: z6.string(),
  source_url: z6.string()
});
var WordMediaSchema = z6.object({
  audio: z6.object({ us: z6.string().nullable(), uk: z6.string().nullable() }),
  /** Theo đúng thứ tự `content.senses`. */
  images: z6.array(z6.object({ url: z6.string(), credit: ImageCreditSchema }).nullable())
});
var StoredWordSchema = z6.object({
  id: z6.string(),
  /** id các nghĩa theo đúng thứ tự `content.senses` (để tạo user_words). */
  senseIds: z6.array(z6.string()),
  content: WordContentSchema,
  media: WordMediaSchema
});
var base = {
  /** Dạng gốc đã chuẩn hóa ("running" → "run"). */
  lemma: z6.string(),
  /** Dạng gốc khác có thể đúng (vd leaves → leaf), để app hỏi lại người dùng. */
  alternatives: z6.array(z6.string())
};
var WordResponseSchema = z6.discriminatedUnion("status", [
  /** Đã có trong kho: trả ngay (một dòng cho mỗi loại từ). */
  z6.object({ status: z6.literal("ready"), ...base, words: z6.array(StoredWordSchema).min(1) }),
  /** Đang tạo nội dung: app hiện "Đang chuẩn bị nội dung" rồi hỏi lại sau. */
  z6.object({ status: z6.literal("preparing"), ...base, jobId: z6.string() }),
  /** Từ ngoài kho, khách chưa đăng nhập: mời đăng nhập. */
  z6.object({ status: z6.literal("login_required"), ...base }),
  /** Đã dùng hết số từ mới hôm nay. */
  z6.object({
    status: z6.literal("limit_reached"),
    ...base,
    dailyLimit: z6.number().int(),
    /** Gói hiện tại: Free hết lượt thì mời nâng cấp Premium. */
    plan: z6.enum(["free", "premium"]).default("free")
  }),
  /** Nhập file khi chưa có Premium (máy chủ chặn, app mời nâng cấp). */
  z6.object({ status: z6.literal("premium_required"), ...base })
]);
var WordSummarySchema = z6.object({
  id: z6.string(),
  lemma: z6.string(),
  pos: PosSchema,
  cefr: z6.string().nullable(),
  senses: z6.array(z6.object({ id: z6.string(), meaning_vi: z6.string() })).min(1)
});
var ResolveResponseSchema = z6.object({
  items: z6.array(
    z6.object({
      /** Chữ người dùng nhập (đã làm sạch). */
      input: z6.string(),
      ...base,
      /** Rỗng: chưa có trong kho. */
      words: z6.array(WordSummarySchema)
    })
  )
});

// src/lib/words/pipeline.ts
function stripIpaSlashes(raw) {
  if (typeof raw !== "object" || raw === null || !("ipa" in raw)) return raw;
  const ipa = raw.ipa;
  if (typeof ipa !== "object" || ipa === null) return raw;
  const cleaned = Object.fromEntries(
    Object.entries(ipa).map(([region, value]) => [
      region,
      typeof value === "string" ? value.replace(/^\s*\/+|\/+\s*$/g, "").trim() : value
    ])
  );
  return { ...raw, ipa: cleaned };
}

// src/lib/words/supabase-store.ts
var WORD_SELECT = "id, language, lemma, pos, ipa_us, ipa_uk, cefr, register, schema_version, forms, details, audio_us_url, audio_uk_url, word_senses (id, sense_order, definition_en, meaning_vi, image_query, image_url, image_credit, word_details (sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes))";
function toStoredWord(row) {
  const senses = [...row.word_senses].sort((a, b) => a.sense_order - b.sense_order);
  const details = senses.flatMap(
    (sense) => sense.word_details === null ? [] : [sense.word_details].flat()
  );
  const content = fromWordRows({
    word: row,
    senses: senses.map((sense) => ({ ...sense, image_query: sense.image_query ?? "" })),
    details
  });
  const images = senses.map((sense) => {
    const credit = ImageCreditSchema.safeParse(sense.image_credit);
    return sense.image_url && credit.success ? { url: sense.image_url, credit: credit.data } : null;
  });
  return {
    id: row.id,
    senseIds: senses.map((sense) => sense.id),
    content,
    media: { audio: { us: row.audio_us_url, uk: row.audio_uk_url }, images }
  };
}

// raw:src/prompts/word-content.md
var word_content_default = '---\ntask: word-content\nversion: 3\nschema: src/lib/schema/word.ts (WordContentSchema, SCHEMA_VERSION 1)\n---\n\n<!--\nPrompt tạo nội dung thẻ từ 5 tab. Phần sau dòng "=== SYSTEM ===" là system prompt,\nsau "=== USER ===" là nội dung gửi kèm từng từ. Biến dạng {{tên}} do\nbuildWordContentPrompt() điền. Nội dung từ dùng chung cho mọi người nên KHÔNG có\ncâu ngữ cảnh của người dùng (quy tắc gói miễn phí). Sửa prompt → tăng version.\n-->\n\n=== SYSTEM ===\nBạn là nhà từ điển học và giáo viên {{language_name}} giàu kinh nghiệm dạy người Việt.\nBạn tạo nội dung thẻ từ chính xác, tự nhiên, đúng cách người bản ngữ dùng. Không bịa:\nmục nào không thực sự tồn tại thì trả mảng rỗng (hoặc null với trường cho phép null).\nMọi phần giải thích viết bằng tiếng Việt tự nhiên, ngắn gọn.\nChỉ trả về một đối tượng JSON đúng schema được cung cấp, không thêm chữ nào khác.\n\n=== USER ===\nTạo nội dung học cho từ "{{lemma}}" (ngôn ngữ: {{language}}, loại từ: {{pos_label}}).\nNgười học ở trình độ {{cefr_level}}.\nNghĩa tham khảo từ Wiktionary (có thể rỗng; chỉ để tham khảo, thứ tự KHÔNG theo tần suất): {{dictionary_json}}\n\nĐầu thẻ (cấp từ):\n\n- schema_version = 1, language = "{{language}}", lemma = "{{lemma}}".\n- {{pos_rule}}\n- ipa: us và uk, KHÔNG kèm dấu "/"; tách âm tiết bằng dấu chấm nếu được (vd "rɪˈzɪl.jənt").\n  Dùng ký hiệu quen thuộc trong từ điển học tập (Cambridge, Oxford): r chứ không ɹ, dʒ/tʃ\n  không có dấu nối, không ngoặc đơn, không ký hiệu phiên âm hẹp (ɫ, ʔ, ɾ).\n- cefr: trình độ CEFR phổ biến của từ (không phải trình độ người học).\n- register: mức trang trọng chung của từ.\n- forms.inflections: dạng chia/số nhiều/so sánh của ĐÚNG loại từ trên thẻ (danh từ chỉ có\n  plural, không ghi dạng động từ); irregular = true nếu bất quy tắc. Chỉ ghi dạng dùng được với\n  các nghĩa trong senses: danh từ không đếm được hoặc đã ở số nhiều (people, news) thì không\n  ghi plural.\n  forms.variants: biến thể chính tả Anh–Mỹ của chính từ này (colour/color), không có thì [].\n- language_extra = null với tiếng Anh.\n\nTab Nghĩa (senses):\n\n- Chỉ nghĩa phổ biến, tối đa 3, sắp theo tần suất (phổ biến nhất trước).\n- definition_en ngắn, dễ hiểu; meaning_vi ngắn gọn, tự nhiên, không dịch từ-đối-từ.\n- image_query: 2–4 từ tiếng Anh mô tả một hình ảnh cụ thể, dễ nhớ cho nghĩa này.\n\nTab Ví dụ (senses[].examples):\n\n- 3 câu mỗi nghĩa, ngữ cảnh đời thường, 8–18 từ; từ vựng xung quanh dễ hơn hoặc\n  bằng {{cefr_level}}; có translation_vi.\n- highlight: đúng dạng từ xuất hiện trong câu (vd "ran"), phải có nguyên văn trong sentence.\n\nTab Cách dùng (theo từng nghĩa):\n\n- collocations: chỉ cụm người bản ngữ thực sự hay dùng, ghi pattern (vd "verb + noun",\n  "adverb + adjective"), tối đa 8.\n- idioms: chỉ khi thực sự tồn tại, gắn register; không có thì [].\n- common_mistakes: tối đa 3 lỗi người Việt hay mắc với nghĩa này (wrong, correct,\n  explanation_vi), vd "resilient with stress" → "resilient to stress". Không có lỗi\n  điển hình thì [].\n\nTab Từ liên quan:\n\n- senses[].synonyms kèm nuance_vi nói rõ khác biệt sắc thái/ngữ cảnh; senses[].antonyms.\n- homonyms (cấp từ): từ viết giống (homograph) hoặc đọc giống (homophone) nhưng khác nghĩa.\n- word_family (cấp từ): các từ cùng họ (danh/động/tính/trạng từ), note_vi nếu cần.\n\nTab Ghi nhớ (cấp từ):\n\n- mnemonics: tối đa 2 mẹo ngắn cho người Việt (type: sound, etymology, image, story).\n- confusables: từ hay bị nhầm với từ này + difference_vi chỉ ra cách phân biệt.\n- etymology_vi: 1 câu về gốc từ/tiền tố/hậu tố nếu giúp dễ nhớ, không thì null.\n\nconfidence: 0–1 cho collocations, idioms, mnemonics (bạn chắc chắn đến đâu).\nKhông tạo mục slang riêng, không tạo mục ngữ pháp riêng.\n';

// src/functions/admin-word/handler.ts
import { z as z9 } from "npm:zod@4.6.5";

// src/lib/admin/review.ts
import { z as z8 } from "npm:zod@4.6.5";

// src/lib/words/user-additions.ts
import { z as z7 } from "npm:zod@4.6.5";
var ADDITION_LIMITS = {
  sentence: 300,
  translation: 300,
  phrase: 100,
  word: 64,
  note: 300,
  text: 500
};
var id = z7.string().min(1).max(64);
var text2 = (max) => z7.string().trim().min(1).max(max);
var optionalText = (max) => z7.string().trim().max(max).nullish().transform((s) => s ? s : null);
var NoteAdditionSchema = z7.object({ id, text: text2(ADDITION_LIMITS.text) });
var ExampleAdditionSchema = z7.object({
  id,
  sentence: text2(ADDITION_LIMITS.sentence),
  translation_vi: optionalText(ADDITION_LIMITS.translation)
});
var UsageAdditionSchema = z7.object({
  id,
  phrase: text2(ADDITION_LIMITS.phrase),
  note: optionalText(ADDITION_LIMITS.note)
});
var RelatedAdditionSchema = z7.object({
  id,
  word: text2(ADDITION_LIMITS.word),
  note: optionalText(ADDITION_LIMITS.note)
});
var MemoryAdditionSchema = z7.object({ id, text: text2(ADDITION_LIMITS.text) });
var CustomMeaningSchema = z7.string().trim().min(1).max(200);

// src/lib/words/word-card.ts
var WORD_CARD_TABS = ["meaning", "examples", "usage", "related", "memory"];

// src/lib/admin/review.ts
var WarningSchema = z8.union([
  z8.object({ code: z8.literal("spelling"), from: z8.string(), to: z8.string() }),
  z8.object({ code: z8.literal("rare") }),
  z8.object({ code: z8.literal("above_level"), cefr: z8.string(), target: z8.string() }),
  z8.object({ code: z8.literal("many_senses"), count: z8.number() }),
  z8.object({ code: z8.literal("no_context") }),
  z8.object({
    code: z8.literal("low_confidence"),
    source: z8.enum(["sense", "content"]),
    value: z8.number()
  })
]);
var REGENERATE_TABS = WORD_CARD_TABS;
var words = (s) => new Set(
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)
);
function similarity(a, b) {
  const x = words(`${a.definition_en} ${a.meaning_vi}`);
  const y = words(`${b.definition_en} ${b.meaning_vi}`);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return common / Math.min(x.size, y.size);
}
function matchSenses(current, generated) {
  const pairs = [];
  current.forEach(
    (a, i) => generated.forEach((b, j) => pairs.push({ i, j, score: similarity(a, b) }))
  );
  pairs.sort((p, q) => q.score - p.score || Math.abs(p.i - p.j) - Math.abs(q.i - q.j));
  const result = current.map(() => null);
  const used = /* @__PURE__ */ new Set();
  for (const { i, j, score: score2 } of pairs) {
    if (score2 <= 0 || result[i] !== null || used.has(j)) continue;
    result[i] = j;
    used.add(j);
  }
  result.forEach((match, i) => {
    if (match === null && i < generated.length && !used.has(i)) {
      result[i] = i;
      used.add(i);
    }
  });
  return result;
}
function mergeRegeneratedTab(current, generated, tab) {
  const match = matchSenses(current.senses, generated.senses);
  const senses = current.senses.map((sense, i) => {
    const j = match[i];
    const g = j === null || j === void 0 ? null : generated.senses[j];
    if (!g) return sense;
    switch (tab) {
      case "meaning":
        return {
          ...sense,
          definition_en: g.definition_en,
          meaning_vi: g.meaning_vi,
          image_query: g.image_query
        };
      case "examples":
        return { ...sense, examples: g.examples };
      case "usage":
        return {
          ...sense,
          collocations: g.collocations,
          idioms: g.idioms,
          common_mistakes: g.common_mistakes
        };
      case "related":
        return { ...sense, synonyms: g.synonyms, antonyms: g.antonyms };
      case "memory":
        return sense;
    }
  });
  const merged = { ...current, senses };
  switch (tab) {
    case "meaning":
      Object.assign(merged, {
        ipa: generated.ipa,
        cefr: generated.cefr,
        register: generated.register,
        forms: generated.forms
      });
      break;
    case "usage":
      merged.confidence = {
        ...current.confidence,
        collocations: generated.confidence.collocations,
        idioms: generated.confidence.idioms
      };
      break;
    case "related":
      Object.assign(merged, { homonyms: generated.homonyms, word_family: generated.word_family });
      break;
    case "memory":
      Object.assign(merged, {
        mnemonics: generated.mnemonics,
        confusables: generated.confusables,
        etymology_vi: generated.etymology_vi
      });
      merged.confidence = { ...current.confidence, mnemonics: generated.confidence.mnemonics };
      break;
    case "examples":
      break;
  }
  return WordContentSchema.parse(merged);
}

// src/functions/admin-word/handler.ts
var AdminWordRequestSchema = z9.object({
  wordId: z9.uuid(),
  tab: z9.enum(REGENERATE_TABS)
});
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}
function createAdminWordHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    try {
      body = AdminWordRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId || !await deps.isAdmin(userId)) return json({ status: "forbidden" }, 403);
      const current = await deps.loadWord(body.wordId);
      if (!current) return json({ status: "not_found" }, 404);
      if (!deps.generate) return json({ status: "unavailable" });
      const generated = await deps.generate(current, body.tab);
      return json({ status: "ok", content: mergeRegeneratedTab(current, generated, body.tab) });
    } catch (error) {
      console.error("admin-word lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}

// src/functions/admin-word/main.ts
function requireEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}
var supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } }
);
var anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
var llm = anthropicKey ? createLlmRouter({
  config: resolveLlmConfig(Deno.env.toObject()),
  providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
  logger: async (entry) => {
    const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
    if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
  }
}) : null;
var template = parsePromptTemplate(word_content_default);
Deno.serve(
  createAdminWordHandler({
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async isAdmin(userId) {
      const { data, error } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`profiles: ${error.message}`);
      return data?.role === "admin";
    },
    async loadWord(wordId) {
      const { data, error } = await supabase.from("words").select(WORD_SELECT).eq("id", wordId).maybeSingle();
      if (error) throw new Error(`words: ${error.message}`);
      return data ? toStoredWord(data).content : null;
    },
    generate: llm ? async (current) => {
      const { system, prompt } = buildWordContentPrompt(template, {
        language: current.language,
        lemma: current.lemma,
        pos: current.pos,
        cefrLevel: SHARED_CONTENT_CEFR
      });
      const result = await llm.generateJSON("word-content", {
        system,
        prompt,
        schema: WordContentSchema.refine(
          (c) => c.lemma.trim().toLowerCase() === current.lemma.toLowerCase(),
          { message: `Phải đúng từ "${current.lemma}"` }
        ),
        preprocess: stripIpaSlashes
      });
      return { ...result.data, pos: current.pos };
    } : null
  })
);
