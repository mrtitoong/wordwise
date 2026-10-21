// File sinh tự động từ src/functions/generate-word/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/generate-word/main.ts
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
  "list-analyzer"
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
  "list-analyzer": { containsUserData: true, models: ["claude-sonnet", "claude-haiku"] }
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

// src/lib/dictionary/free-dictionary.ts
import { z } from "npm:zod@4.6.5";
var FREE_DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
var DEFAULT_TIMEOUT_MS = 8e3;
var MAX_DEFINITIONS = 3;
var ResponseSchema = z.array(
  z.object({
    phonetics: z.array(z.object({ text: z.string().nullish(), audio: z.string().nullish() })).default([]),
    meanings: z.array(
      z.object({
        partOfSpeech: z.string(),
        definitions: z.array(z.object({ definition: z.string() })).default([])
      })
    ).default([])
  })
);
var POS_MAP = {
  noun: "noun",
  verb: "verb",
  adjective: "adjective",
  adverb: "adverb",
  pronoun: "pronoun",
  preposition: "preposition",
  conjunction: "conjunction",
  determiner: "determiner",
  article: "determiner",
  interjection: "interjection",
  "phrasal verb": "phrasal_verb",
  phrase: "phrase",
  idiom: "phrase"
};
function phonemicIpa(text2) {
  const match = /^\s*\/([^/]+)\/\s*$/.exec(text2 ?? "");
  const ipa = match?.[1]?.trim();
  return ipa ? ipa : null;
}
function regionOf(audio) {
  const match = /-(us|uk)\.mp3$/i.exec(audio ?? "");
  return match ? match[1].toLowerCase() : null;
}
function parseFreeDictionary(json2) {
  const parsed = ResponseSchema.safeParse(json2);
  if (!parsed.success || parsed.data.length === 0) return null;
  const ipa = { us: null, uk: null };
  const meanings = /* @__PURE__ */ new Map();
  for (const entry of parsed.data) {
    for (const phonetic of entry.phonetics) {
      const region = regionOf(phonetic.audio);
      const text2 = phonemicIpa(phonetic.text);
      if (region && text2 && ipa[region] === null) ipa[region] = text2;
    }
    for (const meaning of entry.meanings) {
      const pos = POS_MAP[meaning.partOfSpeech.toLowerCase()];
      if (!pos) continue;
      const list = meanings.get(pos) ?? [];
      for (const { definition } of meaning.definitions) {
        if (list.length < MAX_DEFINITIONS && definition.trim()) list.push(definition.trim());
      }
      meanings.set(pos, list);
    }
  }
  if (meanings.size === 0 && ipa.us === null && ipa.uk === null) return null;
  return {
    ipa,
    meanings: [...meanings].map(([pos, definitions]) => ({ pos, definitions }))
  };
}
async function fetchFreeDictionary(lemma, options = {}) {
  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(FREE_DICTIONARY_URL + encodeURIComponent(lemma), {
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { accept: "application/json" }
    });
    if (!response.ok) return null;
    return parseFreeDictionary(await response.json());
  } catch {
    return null;
  }
}
function primaryPos(data) {
  return data?.meanings[0]?.pos ?? null;
}
function dictionaryForPrompt(data, pos) {
  if (!data) return void 0;
  const meanings = pos ? data.meanings.filter((m) => m.pos === pos) : data.meanings;
  return { ipa: data.ipa, meanings };
}
function sameIpa(a, b) {
  const simplify = (s) => s.normalize("NFC").replace(/[.\s‿]/g, "");
  return simplify(a) === simplify(b);
}
function reconcileIpa(content, data) {
  if (!data) return { content, replaced: [] };
  const replaced = [];
  const ipa = { ...content.ipa };
  for (const region of ["us", "uk"]) {
    const fromDictionary = data.ipa[region];
    if (!fromDictionary) continue;
    const fromLlm = ipa[region];
    if (fromLlm && sameIpa(fromLlm, fromDictionary)) continue;
    ipa[region] = fromDictionary;
    replaced.push(region);
  }
  return replaced.length ? { content: { ...content, ipa }, replaced } : { content, replaced };
}

// src/lib/entry/lemmatizer-en.ts
import wink from "npm:wink-lemmatizer@3.0.4";
var englishLemmatizer = {
  verb: (word) => wink.verb(word),
  noun: (word) => wink.noun(word),
  adjective: (word) => wink.adjective(word)
};

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
function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
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
      schemaMode
    }) {
      const serverFallback = SERVER_FALLBACK_MODELS.has(model.model);
      let response;
      try {
        response = await client.beta.messages.create({
          model: model.model,
          max_tokens: model.maxOutputTokens,
          system,
          messages: [{ role: "user", content: prompt }],
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
      const text2 = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
      return {
        text: text2,
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
import { z as z2 } from "npm:zod@4.6.5";

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
    async generateJSON(task, { system, prompt, schema, schemaRetries, preprocess }) {
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
          let text2;
          let usage;
          try {
            ({ text: text2, usage } = await provider.generate({
              model,
              system,
              prompt: fullPrompt,
              jsonSchema,
              schemaMode
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
          const parsed = parseJson(text2, schema, preprocess);
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
  const json2 = z2.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  delete json2.$schema;
  return json2;
}
function schemaInstruction(jsonSchema) {
  return "Trả về DUY NHẤT một đối tượng JSON hợp lệ theo JSON Schema dưới đây (không markdown, không giải thích). Tôn trọng mọi ràng buộc: enum, minItems/maxItems, minLength, giá trị null cho phép.\n" + JSON.stringify(jsonSchema);
}
function parseJson(text2, schema, preprocess) {
  let raw;
  try {
    raw = JSON.parse(stripCodeFence(text2));
  } catch (error) {
    const object = firstJsonObject(text2);
    if (object !== null) {
      try {
        raw = JSON.parse(object);
      } catch {
      }
    }
    if (raw === void 0) {
      return {
        ok: false,
        error: new LlmSchemaError("Không parse được JSON", text2, [
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
        text2,
        result.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`)
      )
    };
  }
  return { ok: true, data: result.data };
}
function firstJsonObject(text2) {
  const start = text2.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text2.length; i++) {
    const char = text2[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text2.slice(start, i + 1);
  }
  return null;
}
function stripCodeFence(text2) {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text2);
  return match ? match[1] : text2;
}
function toProviderError(error, provider) {
  if (error instanceof LlmProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LlmProviderError(message, provider, false, false);
}
function truncate(text2) {
  return text2.length > MAX_ERROR_LENGTH ? text2.slice(0, MAX_ERROR_LENGTH - 1) + "…" : text2;
}

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

// src/lib/schema/word.ts
import { z as z3 } from "npm:zod@4.6.5";
var SCHEMA_VERSION = 1;
var text = z3.string().trim().min(1);
var LanguageSchema = z3.enum(["en", "ja", "zh", "ko", "fr"]);
var CefrSchema = z3.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
var PosSchema = z3.enum([
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
var RegisterSchema = z3.enum(["formal", "neutral", "informal", "slang", "offensive"]);
var ipaText = text.refine((s) => !s.includes("/"), {
  message: "IPA không kèm dấu '/'"
});
var IpaSchema = z3.object({
  us: ipaText.nullable(),
  uk: ipaText.nullable()
});
var InflectionSchema = z3.object({
  label: z3.enum([
    "plural",
    "third_person",
    "past",
    "past_participle",
    "present_participle",
    "comparative",
    "superlative"
  ]),
  form: text,
  irregular: z3.boolean()
});
var SpellingVariantSchema = z3.object({
  form: text,
  region: z3.enum(["us", "uk"]),
  note_vi: text.nullable()
});
var FormsSchema = z3.object({
  inflections: z3.array(InflectionSchema).max(12),
  /** Biến thể Anh–Mỹ của chính từ này (colour/color). */
  variants: z3.array(SpellingVariantSchema).max(4)
});
var ExampleSchema = z3.object({
  sentence: text,
  translation_vi: text,
  /** Đúng dạng từ xuất hiện trong câu (vd "ran"), để UI tô đậm và tạo câu điền từ. */
  highlight: text
}).refine((e) => e.sentence.toLowerCase().includes(e.highlight.toLowerCase()), {
  message: "highlight phải xuất hiện trong sentence",
  path: ["highlight"]
});
var SynonymSchema = z3.object({
  word: text,
  nuance_vi: text
});
var AntonymSchema = z3.object({
  word: text
});
var HomonymSchema = z3.object({
  word: text,
  /** homograph: viết giống (bat – con dơi/gậy); homophone: đọc giống (pair/pear). */
  kind: z3.enum(["homograph", "homophone"]),
  meaning_vi: text
});
var WordFamilyMemberSchema = z3.object({
  word: text,
  pos: PosSchema,
  note_vi: text.nullable()
});
var CollocationSchema = z3.object({
  /** Mẫu cấu trúc, vd "adverb + adjective", "verb + noun". */
  pattern: text,
  /** Cụm từ, vd "remarkably resilient". */
  phrase: text,
  example: text.nullable()
});
var IdiomSchema = z3.object({
  phrase: text,
  meaning_vi: text,
  register: RegisterSchema,
  example: text.nullable()
});
var CommonMistakeSchema = z3.object({
  wrong: text,
  correct: text,
  explanation_vi: text
});
var MnemonicSchema = z3.object({
  type: z3.enum(["sound", "etymology", "image", "story"]),
  text_vi: text
});
var ConfusableSchema = z3.object({
  word: text,
  difference_vi: text
});
var FuriganaSegmentSchema = z3.object({
  text,
  /** Cách đọc kana cho đoạn có kanji; null nếu đoạn đã là kana. */
  reading: text.nullable()
});
var JapaneseExtraSchema = z3.object({
  kind: z3.literal("ja"),
  reading_kana: text,
  furigana: z3.array(FuriganaSegmentSchema).min(1),
  pitch_accent: z3.number().int().min(0).nullable(),
  jlpt: z3.enum(["N5", "N4", "N3", "N2", "N1"]).nullable()
});
var ChineseExtraSchema = z3.object({
  kind: z3.literal("zh"),
  simplified: text,
  traditional: text.nullable(),
  /** Pinyin có dấu, vd "nǔ lì". */
  pinyin: text,
  /** Thanh điệu từng âm tiết: 1–4, 5 = thanh nhẹ. */
  tones: z3.array(z3.number().int().min(1).max(5)).min(1),
  hsk: z3.number().int().min(1).max(9).nullable()
});
var LanguageExtraSchema = z3.discriminatedUnion("kind", [
  JapaneseExtraSchema,
  ChineseExtraSchema
]);
var SenseSchema = z3.object({
  definition_en: text,
  meaning_vi: text,
  /** 2–4 từ tiếng Anh mô tả hình ảnh cụ thể để tìm ảnh gợi nhớ. */
  image_query: text,
  examples: z3.array(ExampleSchema).min(1).max(5),
  synonyms: z3.array(SynonymSchema).max(8),
  antonyms: z3.array(AntonymSchema).max(6),
  collocations: z3.array(CollocationSchema).max(8),
  idioms: z3.array(IdiomSchema).max(6),
  common_mistakes: z3.array(CommonMistakeSchema).max(3)
});
var score = z3.number().min(0).max(1);
var ConfidenceSchema = z3.object({
  collocations: score,
  idioms: score,
  mnemonics: score
});
var WordContentSchema = z3.object({
  schema_version: z3.literal(SCHEMA_VERSION),
  language: LanguageSchema,
  lemma: text,
  pos: PosSchema,
  ipa: IpaSchema,
  cefr: CefrSchema,
  register: RegisterSchema,
  etymology_vi: text.nullable(),
  forms: FormsSchema,
  /** Sắp theo tần suất sử dụng, phổ biến nhất trước. */
  senses: z3.array(SenseSchema).min(1).max(5),
  homonyms: z3.array(HomonymSchema).max(4),
  word_family: z3.array(WordFamilyMemberSchema).max(10),
  mnemonics: z3.array(MnemonicSchema).max(3),
  confusables: z3.array(ConfusableSchema).max(4),
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
function toWordRows(content, ids) {
  const word = {
    id: ids.wordId,
    language: content.language,
    lemma: content.lemma,
    pos: content.pos,
    ipa_us: content.ipa.us,
    ipa_uk: content.ipa.uk,
    cefr: content.cefr,
    register: content.register,
    forms: content.forms,
    details: {
      etymology_vi: content.etymology_vi,
      homonyms: content.homonyms,
      word_family: content.word_family,
      mnemonics: content.mnemonics,
      confusables: content.confusables,
      confidence: content.confidence,
      language_extra: content.language_extra
    },
    schema_version: content.schema_version,
    generated_by: ids.generatedBy ?? null,
    reviewed: ids.reviewed ?? false
  };
  const senses = [];
  const details = [];
  content.senses.forEach((sense, index) => {
    const senseId = ids.senseId(index);
    senses.push({
      id: senseId,
      word_id: ids.wordId,
      sense_order: index,
      definition_en: sense.definition_en,
      meaning_vi: sense.meaning_vi,
      image_query: sense.image_query
    });
    details.push({
      sense_id: senseId,
      examples: sense.examples,
      synonyms: sense.synonyms,
      antonyms: sense.antonyms,
      collocations: sense.collocations,
      idioms: sense.idioms,
      common_mistakes: sense.common_mistakes
    });
  });
  return { word, senses, details };
}
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

// src/lib/words/supabase-store.ts
var WORD_SELECT = "id, language, lemma, pos, ipa_us, ipa_uk, cefr, register, schema_version, forms, details, word_senses (id, sense_order, definition_en, meaning_vi, image_query, word_details (sense_id, examples, synonyms, antonyms, collocations, idioms, common_mistakes))";
function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
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
  return { id: row.id, senseIds: senses.map((sense) => sense.id), content };
}
function toJob(raw) {
  return {
    id: String(raw.id),
    language: LanguageSchema.parse(raw.language),
    lemma: String(raw.lemma),
    pos: raw.pos === null ? null : PosSchema.parse(raw.pos),
    source: raw.source === "bulk" ? "bulk" : "user",
    attempts: Number(raw.attempts),
    frequencyRank: typeof raw.frequency_rank === "number" ? raw.frequency_rank : null
  };
}
function createSupabaseWordStore(client) {
  return {
    async findWords(language, lemma, pos) {
      let query = client.from("words").select(WORD_SELECT).eq("language", language).eq("lemma", lemma).eq("is_hidden", false).order("frequency_rank", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
      if (pos) query = query.eq("pos", pos);
      const rows = check(await query, "Đọc words");
      const words = [];
      for (const row of rows) {
        try {
          words.push(toStoredWord(row));
        } catch (error) {
          console.error(`Bỏ qua từ ${row.id} (${row.lemma}/${row.pos}):`, error);
        }
      }
      return words;
    },
    async findWordId(language, lemma, pos) {
      const data = check(
        await client.from("words").select("id").eq("language", language).eq("lemma", lemma).eq("pos", pos).maybeSingle(),
        "Đọc words"
      );
      return data?.id ?? null;
    },
    async requestJob(userId, language, lemma, pos) {
      const data = check(
        await client.rpc("request_word_job", {
          p_user_id: userId,
          p_language: language,
          p_lemma: lemma,
          ...pos ? { p_pos: pos } : {}
        }),
        "Xếp việc"
      );
      if (data.limit_reached || !data.job_id) {
        return { limitReached: true, dailyLimit: data.daily_limit };
      }
      return { limitReached: false, jobId: data.job_id, dailyLimit: data.daily_limit };
    },
    async claimJobs(limit, jobId) {
      const data = check(
        await client.rpc("claim_word_jobs", {
          p_limit: limit,
          ...jobId ? { p_job_id: jobId } : {}
        }),
        "Nhận việc"
      );
      return data.map(toJob);
    },
    async saveWord(jobId, rows) {
      const id = check(
        await client.rpc("save_generated_word", {
          p_job_id: jobId,
          p_word: rows.word,
          p_senses: rows.senses,
          p_details: rows.details
        }),
        "Lưu từ"
      );
      if (!id) throw new Error("Lưu từ: không nhận được id");
      return id;
    },
    async completeJob(jobId, wordId) {
      check(
        await client.rpc("complete_word_job", { p_job_id: jobId, p_word_id: wordId }),
        "Đóng việc"
      );
    },
    async failJob(jobId, error, retryAt) {
      check(
        await client.rpc("fail_word_job", {
          p_job_id: jobId,
          p_error: error,
          ...retryAt ? { p_retry_at: retryAt.toISOString() } : {}
        }),
        "Ghi lỗi việc"
      );
    }
  };
}

// raw:D:\vibe\WordWise\src\prompts\word-content.md
var word_content_default = '---\ntask: word-content\nversion: 1\nschema: src/lib/schema/word.ts (WordContentSchema, SCHEMA_VERSION 1)\n---\n\n<!--\nPrompt tạo nội dung thẻ từ 5 tab. Phần sau dòng "=== SYSTEM ===" là system prompt,\nsau "=== USER ===" là nội dung gửi kèm từng từ. Biến dạng {{tên}} do\nbuildWordContentPrompt() điền. Nội dung từ dùng chung cho mọi người nên KHÔNG có\ncâu ngữ cảnh của người dùng (quy tắc gói miễn phí). Sửa prompt → tăng version.\n-->\n\n=== SYSTEM ===\nBạn là nhà từ điển học và giáo viên {{language_name}} giàu kinh nghiệm dạy người Việt.\nBạn tạo nội dung thẻ từ chính xác, tự nhiên, đúng cách người bản ngữ dùng. Không bịa:\nmục nào không thực sự tồn tại thì trả mảng rỗng (hoặc null với trường cho phép null).\nMọi phần giải thích viết bằng tiếng Việt tự nhiên, ngắn gọn.\nChỉ trả về một đối tượng JSON đúng schema được cung cấp, không thêm chữ nào khác.\n\n=== USER ===\nTạo nội dung học cho từ "{{lemma}}" (ngôn ngữ: {{language}}, loại từ: {{pos}}).\nNgười học ở trình độ {{cefr_level}}.\nDữ liệu từ điển tham khảo (ưu tiên khi mâu thuẫn, có thể rỗng): {{dictionary_json}}\n\nĐầu thẻ (cấp từ):\n\n- schema_version = 1, language = "{{language}}", lemma = "{{lemma}}", pos = "{{pos}}".\n- ipa: us và uk, KHÔNG kèm dấu "/"; tách âm tiết bằng dấu chấm nếu được (vd "rɪˈzɪl.jənt").\n- cefr: trình độ CEFR phổ biến của từ (không phải trình độ người học).\n- register: mức trang trọng chung của từ.\n- forms.inflections: dạng chia/số nhiều/so sánh; irregular = true nếu bất quy tắc.\n  forms.variants: biến thể chính tả Anh–Mỹ của chính từ này (colour/color), không có thì [].\n- language_extra = null với tiếng Anh.\n\nTab Nghĩa (senses):\n\n- Chỉ nghĩa phổ biến, tối đa 3, sắp theo tần suất (phổ biến nhất trước).\n- definition_en ngắn, dễ hiểu; meaning_vi ngắn gọn, tự nhiên, không dịch từ-đối-từ.\n- image_query: 2–4 từ tiếng Anh mô tả một hình ảnh cụ thể, dễ nhớ cho nghĩa này.\n\nTab Ví dụ (senses[].examples):\n\n- 3 câu mỗi nghĩa, ngữ cảnh đời thường, 8–18 từ; từ vựng xung quanh dễ hơn hoặc\n  bằng {{cefr_level}}; có translation_vi.\n- highlight: đúng dạng từ xuất hiện trong câu (vd "ran"), phải có nguyên văn trong sentence.\n\nTab Cách dùng (theo từng nghĩa):\n\n- collocations: chỉ cụm người bản ngữ thực sự hay dùng, ghi pattern (vd "verb + noun",\n  "adverb + adjective"), tối đa 8.\n- idioms: chỉ khi thực sự tồn tại, gắn register; không có thì [].\n- common_mistakes: tối đa 3 lỗi người Việt hay mắc với nghĩa này (wrong, correct,\n  explanation_vi), vd "resilient with stress" → "resilient to stress". Không có lỗi\n  điển hình thì [].\n\nTab Từ liên quan:\n\n- senses[].synonyms kèm nuance_vi nói rõ khác biệt sắc thái/ngữ cảnh; senses[].antonyms.\n- homonyms (cấp từ): từ viết giống (homograph) hoặc đọc giống (homophone) nhưng khác nghĩa.\n- word_family (cấp từ): các từ cùng họ (danh/động/tính/trạng từ), note_vi nếu cần.\n\nTab Ghi nhớ (cấp từ):\n\n- mnemonics: tối đa 2 mẹo ngắn cho người Việt (type: sound, etymology, image, story).\n- confusables: từ hay bị nhầm với từ này + difference_vi chỉ ra cách phân biệt.\n- etymology_vi: 1 câu về gốc từ/tiền tố/hậu tố nếu giúp dễ nhớ, không thì null.\n\nconfidence: 0–1 cho collocations, idioms, mnemonics (bạn chắc chắn đến đâu).\nKhông tạo mục slang riêng, không tạo mục ngữ pháp riêng.\n';

// src/lib/words/api.ts
import { z as z5 } from "npm:zod@4.6.5";
var WordRequestSchema = z5.object({
  action: z5.literal("request").default("request"),
  lemma: z5.string().trim().min(1).max(64),
  language: LanguageSchema.default("en"),
  pos: PosSchema.nullish()
});
var WorkerRequestSchema = z5.object({ action: z5.literal("work") });
var FunctionRequestSchema = z5.union([WorkerRequestSchema, WordRequestSchema]);
var StoredWordSchema = z5.object({
  id: z5.string(),
  /** id các nghĩa theo đúng thứ tự `content.senses` (để tạo user_words). */
  senseIds: z5.array(z5.string()),
  content: WordContentSchema
});
var base = {
  /** Dạng gốc đã chuẩn hóa ("running" → "run"). */
  lemma: z5.string(),
  /** Dạng gốc khác có thể đúng (vd leaves → leaf), để app hỏi lại người dùng. */
  alternatives: z5.array(z5.string())
};
var WordResponseSchema = z5.discriminatedUnion("status", [
  /** Đã có trong kho: trả ngay (một dòng cho mỗi loại từ). */
  z5.object({ status: z5.literal("ready"), ...base, words: z5.array(StoredWordSchema).min(1) }),
  /** Đang tạo nội dung: app hiện "Đang chuẩn bị nội dung" rồi hỏi lại sau. */
  z5.object({ status: z5.literal("preparing"), ...base, jobId: z5.string() }),
  /** Từ ngoài kho, khách chưa đăng nhập: mời đăng nhập. */
  z5.object({ status: z5.literal("login_required"), ...base }),
  /** Đã dùng hết số từ mới hôm nay. */
  z5.object({ status: z5.literal("limit_reached"), ...base, dailyLimit: z5.number().int() })
]);

// src/config/words.ts
var SHARED_CONTENT_CEFR = "B1";
var MAX_JOB_ATTEMPTS = 6;
var JOB_RETRY_DELAYS_MINUTES = [1, 5, 15, 30, 60];
var WORKER_MIN_REMAINING_MS = 75e3;
var WORKER_TIME_BUDGET_MS = 14e4;

// src/lib/entry/lemma.ts
var KEEP_AS_IS = /* @__PURE__ */ new Set([
  // Tính từ -ing/-ed hay gặp
  "amazed",
  "amazing",
  "annoyed",
  "annoying",
  "bored",
  "boring",
  "confused",
  "confusing",
  "disappointed",
  "disappointing",
  "embarrassed",
  "embarrassing",
  "excited",
  "exciting",
  "frightened",
  "frightening",
  "interested",
  "interesting",
  "pleased",
  "relaxed",
  "relaxing",
  "satisfied",
  "satisfying",
  "scared",
  "shocked",
  "shocking",
  "surprised",
  "surprising",
  "tired",
  "tiring",
  "worried",
  "worrying",
  // Danh từ -ing
  "beginning",
  "building",
  "ceiling",
  "clothing",
  "evening",
  "feeling",
  "meeting",
  "morning",
  "painting",
  "training",
  "wedding",
  // Danh từ luôn ở số nhiều hoặc mang nghĩa riêng
  "belongings",
  "clothes",
  "customs",
  "data",
  "earnings",
  "economics",
  "glasses",
  "goods",
  "headquarters",
  "jeans",
  "mathematics",
  "means",
  "media",
  "news",
  "outskirts",
  "physics",
  "politics",
  "savings",
  "scissors",
  "series",
  "species",
  "surroundings",
  "thanks",
  "trousers",
  // So sánh hơn/nhất hay được học như từ riêng
  "best",
  "better",
  "worse",
  "worst"
]);
var EDGE_PUNCTUATION = /^[\s"'“”‘’.,;:!?()[\]{}…]+|[\s"'“”‘’.,;:!?()[\]{}…]+$/g;
function cleanSurface(input) {
  return input.normalize("NFC").replace(/[’‘]/g, "'").toLowerCase().replace(EDGE_PUNCTUATION, "").replace(/\s+/g, " ").trim();
}
function unique(values) {
  return [...new Set(values)];
}
function lemmatizeWord(word, lemmatizer, pos) {
  const candidates = unique([
    lemmatizer.verb(word),
    lemmatizer.noun(word),
    lemmatizer.adjective(word)
  ]).filter((candidate) => candidate !== word && candidate !== "");
  let lemma;
  switch (pos) {
    case "verb":
    case "phrasal_verb":
      lemma = lemmatizer.verb(word);
      break;
    case "noun":
      lemma = lemmatizer.noun(word);
      break;
    case "adjective":
      lemma = lemmatizer.adjective(word);
      break;
    case null:
      lemma = KEEP_AS_IS.has(word) ? word : candidates[0] ?? word;
      break;
    default:
      lemma = word;
  }
  if (!lemma) lemma = word;
  const alternatives = unique([word, ...candidates]).filter((candidate) => candidate !== lemma);
  return { lemma, surface: word, alternatives };
}
function toLemma(input, options) {
  const surface = cleanSurface(input);
  const pos = options.pos ?? null;
  if (options.language !== "en" || surface === "") {
    return { lemma: surface, surface, alternatives: [] };
  }
  const words = surface.split(" ");
  if (words.length === 1) return lemmatizeWord(surface, options.lemmatizer, pos);
  if (pos !== null && pos !== "phrasal_verb" && pos !== "verb" && pos !== "phrase") {
    return { lemma: surface, surface, alternatives: [] };
  }
  const [head, ...rest] = words;
  const verb = options.lemmatizer.verb(head);
  const lemma = [verb || head, ...rest].join(" ");
  return { lemma, surface, alternatives: lemma === surface ? [] : [surface] };
}

// src/lib/llm/tasks/word-content.ts
var LANGUAGE_NAMES = {
  en: "tiếng Anh",
  ja: "tiếng Nhật",
  zh: "tiếng Trung",
  ko: "tiếng Hàn",
  fr: "tiếng Pháp"
};
function buildWordContentPrompt(template, request) {
  if (template.task !== "word-content") {
    throw new Error(`Cần prompt word-content, nhận ${template.task}`);
  }
  const { language, lemma, pos, cefrLevel, dictionary } = request;
  const vars = {
    language,
    language_name: LANGUAGE_NAMES[language],
    lemma: lemma.trim(),
    pos: pos ?? "tất cả loại từ phổ biến",
    cefr_level: cefrLevel,
    dictionary_json: dictionary === void 0 ? "{}" : JSON.stringify(dictionary)
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
    promptVersion: template.version
  };
}

// src/lib/words/pipeline.ts
async function requestWord(request, userId, deps) {
  const pos = request.pos ?? null;
  const { lemma, surface, alternatives } = toLemma(request.lemma, {
    language: request.language,
    pos,
    lemmatizer: deps.lemmatizer
  });
  const base2 = { lemma, alternatives };
  const words = await deps.store.findWords(request.language, lemma, pos);
  if (words.length > 0) return { status: "ready", ...base2, words };
  if (surface !== lemma) {
    const asTyped = await deps.store.findWords(request.language, surface, pos);
    if (asTyped.length > 0) {
      return {
        status: "ready",
        lemma: surface,
        alternatives: [lemma, ...alternatives.filter((a) => a !== surface)],
        words: asTyped
      };
    }
  }
  if (!userId) return { status: "login_required", ...base2 };
  const job = await deps.store.requestJob(userId, request.language, lemma, pos);
  if (job.limitReached) return { status: "limit_reached", ...base2, dailyLimit: job.dailyLimit };
  return { status: "preparing", ...base2, jobId: job.jobId };
}
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
function contentSchemaFor(job, pos) {
  return WordContentSchema.refine(
    (content) => content.language === job.language && content.lemma.trim().toLowerCase() === job.lemma && (pos === null || content.pos === pos),
    { message: `Phải đúng từ "${job.lemma}"${pos ? ` (${pos})` : ""}, ngôn ngữ ${job.language}` }
  );
}
function retryDelayMs(attempts) {
  const minutes = JOB_RETRY_DELAYS_MINUTES[Math.min(attempts, JOB_RETRY_DELAYS_MINUTES.length) - 1] ?? JOB_RETRY_DELAYS_MINUTES[0];
  return minutes * 6e4;
}
async function processJob(job, deps) {
  const now = deps.now ?? Date.now;
  try {
    const dictionary = job.language === "en" ? await deps.fetchDictionary(job.lemma) : null;
    const pos = job.pos ?? primaryPos(dictionary);
    if (pos) {
      const existing = await deps.store.findWordId(job.language, job.lemma, pos);
      if (existing) {
        await deps.store.completeJob(job.id, existing);
        return { status: "done", wordId: existing, created: false, ipaReplaced: [] };
      }
    }
    const { system, prompt, promptVersion } = buildWordContentPrompt(deps.template, {
      language: job.language,
      lemma: job.lemma,
      pos,
      cefrLevel: SHARED_CONTENT_CEFR,
      dictionary: dictionaryForPrompt(dictionary, pos)
    });
    const result = await deps.llm.generateJSON("word-content", {
      system,
      prompt,
      schema: contentSchemaFor(job, pos),
      preprocess: stripIpaSlashes
    });
    const generated = { ...result.data, lemma: job.lemma };
    const { content, replaced } = reconcileIpa(generated, dictionary);
    if (!pos) {
      const existing = await deps.store.findWordId(job.language, job.lemma, content.pos);
      if (existing) {
        await deps.store.completeJob(job.id, existing);
        return { status: "done", wordId: existing, created: false, ipaReplaced: [] };
      }
    }
    const wordId = deps.newId();
    const rows = toWordRows(content, {
      wordId,
      senseId: () => deps.newId(),
      generatedBy: `${result.model.provider}/${result.model.model} word-content@v${promptVersion}`,
      reviewed: false
    });
    if (job.frequencyRank !== null) rows.word.frequency_rank = job.frequencyRank;
    const savedId = await deps.store.saveWord(job.id, rows);
    return { status: "done", wordId: savedId, created: savedId === wordId, ipaReplaced: replaced };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.attempts >= MAX_JOB_ATTEMPTS) {
      await deps.store.failJob(job.id, message, null);
      return { status: "failed", error: message };
    }
    const retryAt = new Date(now() + retryDelayMs(job.attempts));
    await deps.store.failJob(job.id, message, retryAt);
    return { status: "retry", error: message, retryAt };
  }
}
async function runWorker(deps, options = {}) {
  const now = deps.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? WORKER_TIME_BUDGET_MS);
  const maxJobs = options.maxJobs ?? Number.POSITIVE_INFINITY;
  const outcomes = [];
  let jobId = options.jobId;
  while (outcomes.length < maxJobs && deadline - now() >= WORKER_MIN_REMAINING_MS) {
    const targeted = jobId !== void 0;
    const [job] = await deps.store.claimJobs(1, jobId);
    jobId = void 0;
    if (!job) {
      if (targeted) continue;
      break;
    }
    outcomes.push(await processJob(job, deps));
  }
  return outcomes;
}

// src/functions/generate-word/handler.ts
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
function summarize(outcomes) {
  return {
    processed: outcomes.length,
    done: outcomes.filter((o) => o.status === "done").length,
    retry: outcomes.filter((o) => o.status === "retry").length,
    failed: outcomes.filter((o) => o.status === "failed").length
  };
}
function createHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    try {
      body = FunctionRequestSchema.parse(await request.json());
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    try {
      if (body.action === "work") {
        const secret = request.headers.get("x-worker-secret") ?? "";
        if (!secret || !await deps.verifyWorkerSecret(secret)) {
          return json({ error: "unauthorized" }, 401);
        }
        if (!deps.worker) return json({ error: "llm_not_configured" }, 503);
        return json(summarize(await runWorker(deps.worker)));
      }
      const userId = await deps.getUserId(request.headers.get("authorization"));
      const response = await requestWord(body, userId, deps.pipeline);
      if (response.status === "preparing" && deps.worker) {
        deps.waitUntil(
          runWorker(deps.worker, { jobId: response.jobId, maxJobs: 1 }).catch(
            (error) => console.error("Worker lỗi:", error)
          )
        );
      }
      return json(response);
    } catch (error) {
      console.error("generate-word lỗi:", error);
      return json({ error: "internal_error" }, 500);
    }
  };
}

// src/functions/generate-word/main.ts
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
var store = createSupabaseWordStore(supabase);
var anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
var worker = anthropicKey ? {
  store,
  llm: createLlmRouter({
    config: resolveLlmConfig(Deno.env.toObject()),
    providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
    logger: async (entry) => {
      const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
      if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
    }
  }),
  template: parsePromptTemplate(word_content_default),
  fetchDictionary: (lemma) => fetchFreeDictionary(lemma),
  newId: () => crypto.randomUUID()
} : null;
if (!worker)
  console.warn("Chưa có ANTHROPIC_API_KEY: chỉ tra kho và xếp việc, không tạo nội dung.");
Deno.serve(
  createHandler({
    pipeline: { store, lemmatizer: englishLemmatizer },
    worker,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async verifyWorkerSecret(secret) {
      const { data, error } = await supabase.rpc("verify_worker_secret", { p_secret: secret });
      return !error && data === true;
    },
    waitUntil(promise) {
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(promise);
    }
  })
);
