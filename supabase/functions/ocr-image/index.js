// File sinh tự động từ src/functions/ocr-image/main.ts bởi scripts/build-functions.ts.
// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.

// src/functions/ocr-image/main.ts
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
      const text = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
      return {
        text,
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
          const base = { task, provider: model.provider, model: model.model, attempt, isFallback };
          const started = now();
          let text;
          let usage;
          try {
            ({ text, usage } = await provider.generate({
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
              ...base,
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
          const parsed = parseJson(text, schema, preprocess);
          if (!parsed.ok) {
            await log({
              ...base,
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
          await log({ ...base, outcome: "ok", ...usage, durationMs, error: null });
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
function parseJson(text, schema, preprocess) {
  let raw;
  try {
    raw = JSON.parse(stripCodeFence(text));
  } catch (error) {
    const object = firstJsonObject(text);
    if (object !== null) {
      try {
        raw = JSON.parse(object);
      } catch {
      }
    }
    if (raw === void 0) {
      return {
        ok: false,
        error: new LlmSchemaError("Không parse được JSON", text, [
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
        text,
        result.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`)
      )
    };
  }
  return { ok: true, data: result.data };
}
function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
function stripCodeFence(text) {
  const match = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text);
  return match ? match[1] : text;
}
function toProviderError(error, provider) {
  if (error instanceof LlmProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new LlmProviderError(message, provider, false, false);
}
function truncate(text) {
  return text.length > MAX_ERROR_LENGTH ? text.slice(0, MAX_ERROR_LENGTH - 1) + "…" : text;
}

// src/lib/llm/tasks/photo-ocr.ts
import { z as z2 } from "npm:zod@4.6.5";
var PhotoTextSchema = z2.object({
  /** false: ảnh không có chữ đọc được. */
  legible: z2.boolean(),
  /** Chữ trên ảnh, giữ xuống dòng; dòng trống ngăn cách đoạn. */
  text: z2.string().max(12e3)
});
function buildPhotoOcrPrompt(template2) {
  if (template2.task !== "photo-ocr") {
    throw new Error(`Cần prompt photo-ocr, nhận ${template2.task}`);
  }
  return { system: template2.system, prompt: template2.user };
}

// src/lib/ocr/document.ts
import { z as z3 } from "npm:zod@4.6.5";
var BoxSchema = z3.object({
  x: z3.number(),
  y: z3.number(),
  w: z3.number(),
  h: z3.number()
});
var OcrTokenSchema = z3.object({
  text: z3.string(),
  /** word: có chữ cái hoặc số; punct: dấu câu, ký hiệu. */
  kind: z3.enum(["word", "punct"]),
  /** Một từ bị ngắt dòng bằng gạch nối có hai khung; rỗng khi đọc bằng LLM. */
  boxes: z3.array(BoxSchema),
  confidence: z3.number().nullable(),
  /** Có khoảng trắng (hoặc xuống dòng) trước token. */
  spaceBefore: z3.boolean(),
  paragraph: z3.number().int(),
  sentence: z3.number().int()
});
var OcrDocumentSchema = z3.object({
  source: z3.enum(["vision", "llm"]),
  tokens: z3.array(OcrTokenSchema),
  /** Trung bình độ tin cậy của các từ (Vision); null khi đọc bằng LLM. */
  meanConfidence: z3.number().nullable(),
  /** Độ nghiêng của dòng chữ (độ, dương là xoay chiều kim đồng hồ); null khi không đo được. */
  skewDegrees: z3.number().nullable()
});
var MAX_TOKENS = 2500;
var WORDLIKE = /[\p{L}\p{N}]/u;
var SENTENCE_END = /^[.!?…]+$|^[.!?]["'”’)]$/;
var ABBREVIATIONS = /* @__PURE__ */ new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "vs",
  "prof",
  "inc",
  "jr",
  "sr",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "vol",
  "p",
  "pp"
]);
function tokenKind(text) {
  return WORDLIKE.test(text) ? "word" : "punct";
}
function assignSentences(tokens) {
  const out = [];
  let sentence = 0;
  for (const [i, token] of tokens.entries()) {
    const prev = out[i - 1];
    if (prev && token.paragraph !== prev.paragraph) sentence++;
    else if (prev && SENTENCE_END.test(prev.text) && startsSentence(token)) {
      const before = tokens[i - 2];
      const abbreviation = prev.text === "." && before?.kind === "word" && !prev.spaceBefore && ABBREVIATIONS.has(before.text.toLowerCase());
      if (!abbreviation) sentence++;
    }
    out.push({ ...token, sentence });
  }
  return out;
}
function startsSentence(token) {
  return /^[\p{Lu}\p{N}"'“‘(]/u.test(token.text);
}
function wordCount(doc) {
  return doc.tokens.filter((t) => t.kind === "word").length;
}
function documentFromText(text) {
  const paragraphs = text.replaceAll("\r\n", "\n").replace(/(\p{L})-\n[ \t]*(\p{Ll})/gu, "$1$2").split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);
  const raw = [];
  for (const [paragraph, body] of paragraphs.entries()) {
    const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*|[^\s\p{L}\p{N}]/gu;
    let last = 0;
    for (const match of body.matchAll(pattern)) {
      const gap = body.slice(last, match.index);
      raw.push({
        text: match[0],
        kind: tokenKind(match[0]),
        boxes: [],
        confidence: null,
        spaceBefore: raw.length > 0 && (gap.length > 0 || match.index === 0),
        paragraph
      });
      last = match.index + match[0].length;
      if (raw.length >= MAX_TOKENS) break;
    }
  }
  return {
    source: "llm",
    tokens: assignSentences(raw),
    meanConfidence: null,
    skewDegrees: null
  };
}

// src/lib/ocr/vision.ts
var ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
var VisionError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "VisionError";
  }
  status;
};
function createVisionOcr(options) {
  const doFetch = options.fetch ?? fetch;
  return {
    async read(imageBase64) {
      const response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: { languageHints: ["en"] }
            }
          ]
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 2e4)
      });
      if (!response.ok) {
        throw new VisionError(`Vision HTTP ${response.status}`, response.status);
      }
      const body = await response.json();
      const first = body.responses?.[0];
      if (first?.error) {
        throw new VisionError(`Vision: ${first.error.message ?? "lỗi"}`, first.error.code ?? null);
      }
      return documentFromVision(first?.fullTextAnnotation);
    }
  };
}
function toBox(vertices, width, height) {
  if (!vertices?.length || width <= 0 || height <= 0) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const clamp = (n) => Math.min(1, Math.max(0, n));
  const x = clamp(Math.min(...xs) / width);
  const y = clamp(Math.min(...ys) / height);
  return {
    x,
    y,
    w: clamp(Math.max(...xs) / width) - x,
    h: clamp(Math.max(...ys) / height) - y
  };
}
function topEdgeAngle(vertices) {
  const [a, b] = vertices ?? [];
  if (!a || !b) return null;
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dy = (b.y ?? 0) - (a.y ?? 0);
  if (Math.hypot(dx, dy) < 8) return null;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  while (angle > 45) angle -= 90;
  while (angle < -45) angle += 90;
  return angle;
}
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function documentFromVision(annotation) {
  const raw = [];
  const confidences = [];
  const angles = [];
  let paragraph = -1;
  let breakBefore;
  pages: for (const page of annotation?.pages ?? []) {
    const width = page.width ?? 0;
    const height = page.height ?? 0;
    for (const block of page.blocks ?? []) {
      if (block.blockType && block.blockType !== "TEXT") continue;
      for (const para of block.paragraphs ?? []) {
        paragraph++;
        breakBefore = void 0;
        for (const word of para.words ?? []) {
          const symbols = word.symbols ?? [];
          const text = symbols.map((s) => s.text).join("");
          if (!text) continue;
          const vertices = word.boundingBox?.vertices;
          const box = toBox(vertices, width, height);
          const kind = tokenKind(text);
          if (kind === "word") {
            if (typeof word.confidence === "number") confidences.push(word.confidence);
            const angle = topEdgeAngle(vertices);
            if (angle !== null) angles.push(angle);
          }
          const prev = raw[raw.length - 1];
          const lastBreak = symbols[symbols.length - 1]?.property?.detectedBreak?.type;
          if (breakBefore === "HYPHEN" && prev?.kind === "word" && prev.paragraph === paragraph && kind === "word" && /^\p{Ll}/u.test(text)) {
            prev.text = prev.text.replace(/-$/, "") + text;
            if (box) prev.boxes.push(box);
            prev.confidence = prev.confidence === null || word.confidence === void 0 ? prev.confidence : Math.min(prev.confidence, word.confidence);
            breakBefore = lastBreak;
            continue;
          }
          raw.push({
            text,
            kind,
            boxes: box ? [box] : [],
            confidence: typeof word.confidence === "number" ? word.confidence : null,
            spaceBefore: raw.length > 0 && (breakBefore !== void 0 || prev?.paragraph !== paragraph),
            paragraph
          });
          breakBefore = lastBreak && lastBreak !== "UNKNOWN" ? lastBreak : void 0;
          if (raw.length >= MAX_TOKENS) break pages;
        }
      }
    }
  }
  const mean = confidences.length ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : null;
  const skew = median(angles);
  return {
    source: "vision",
    tokens: assignSentences(raw),
    meanConfidence: mean === null ? null : Math.round(mean * 1e3) / 1e3,
    skewDegrees: skew === null ? null : Math.round(skew * 10) / 10
  };
}

// raw:src/prompts/photo-ocr.md
var photo_ocr_default = '---\ntask: photo-ocr\nversion: 1\nschema: src/lib/llm/tasks/photo-ocr.ts (PhotoTextSchema)\n---\n\n<!--\nĐọc chữ trên ảnh người dùng chụp (trang sách, màn hình, biển hiệu, chữ viết tay) khi Google Cloud\nVision đọc kém. Ảnh gửi kèm prompt; là dữ liệu người dùng nên chạy model trả phí\n(containsUserData). Sửa prompt → tăng version.\n-->\n\n=== SYSTEM ===\nBạn là công cụ đọc chữ trên ảnh (OCR) chính xác. Bạn chép lại đúng chữ nhìn thấy, không sửa chính\ntả, không dịch, không tóm tắt, không thêm chữ không có trên ảnh. Chỉ trả về một đối tượng JSON đúng\nschema.\n\n=== USER ===\nChép lại toàn bộ chữ tiếng Anh trên ảnh này, theo thứ tự đọc tự nhiên (trên xuống dưới, trái sang\nphải; trang hai cột thì hết cột trái rồi tới cột phải).\n\n- Giữ xuống dòng như trên ảnh; để một dòng trống giữa các đoạn hoặc khối chữ tách biệt.\n- Từ bị ngắt cuối dòng bằng gạch nối: giữ nguyên gạch nối và xuống dòng.\n- Bỏ qua số trang, chữ quá nhỏ hoặc mờ không đọc chắc được.\n- legible = false và text = "" nếu ảnh không có chữ đọc được.\n';

// src/functions/ocr-image/handler.ts
import { z as z5 } from "npm:zod@4.6.5";

// src/lib/ocr/api.ts
import { z as z4 } from "npm:zod@4.6.5";
var MAX_IMAGE_BASE64_LENGTH = 6e6;
var OcrRequestSchema = z4.object({
  image: z4.string().min(100).max(MAX_IMAGE_BASE64_LENGTH).regex(/^[A-Za-z0-9+/]+={0,2}$/)
});
var OcrResponseSchema = z4.discriminatedUnion("status", [
  z4.object({ status: z4.literal("ok"), document: OcrDocumentSchema }),
  /** Không thấy chữ trên ảnh. */
  z4.object({ status: z4.literal("no_text") }),
  z4.object({ status: z4.literal("login_required") }),
  /** Đọc chữ trên ảnh chỉ dành cho Premium. */
  z4.object({ status: z4.literal("premium_required") }),
  z4.object({ status: z4.literal("limit_reached"), dailyLimit: z4.number().int() }),
  /** Chưa cấu hình khóa, dịch vụ lỗi hoặc mất mạng. */
  z4.object({ status: z4.literal("unavailable") })
]);
function sniffImageType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "image/png";
  }
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) === "RIFF" && tag(8) === "WEBP") return "image/webp";
  return null;
}

// src/lib/voice/wav.ts
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// src/functions/ocr-image/handler.ts
var VISION_MIN_CONFIDENCE = 0.75;
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
function needsFallback(doc) {
  return !doc || wordCount(doc) === 0 || doc.meanConfidence !== null && doc.meanConfidence < VISION_MIN_CONFIDENCE;
}
function createOcrHandler(deps) {
  return async function handle(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let image;
    let mediaType;
    try {
      ({ image } = OcrRequestSchema.parse(await request.json()));
      const type = sniffImageType(base64ToBytes(image.slice(0, 64)));
      if (!type) throw new Error("not an image");
      mediaType = type;
    } catch (error) {
      return json(
        { error: error instanceof z5.ZodError ? "invalid_request" : "invalid_image" },
        400
      );
    }
    try {
      const userId = await deps.getUserId(request.headers.get("authorization"));
      if (!userId) return json({ status: "login_required" });
      if (await deps.getPlan(userId) !== "premium") return json({ status: "premium_required" });
      if (!deps.vision && !deps.readWithLlm) return json({ status: "unavailable" });
      const quota = await deps.consumeUsage(userId);
      if (!quota.allowed) return json({ status: "limit_reached", dailyLimit: quota.dailyLimit });
      let doc = null;
      let visionFailed = false;
      if (deps.vision) {
        try {
          doc = await deps.vision.read(image);
        } catch (error) {
          visionFailed = true;
          console.error("Vision lỗi:", error instanceof Error ? error.message : error);
        }
      }
      if (needsFallback(doc) && deps.readWithLlm) {
        try {
          const text = await deps.readWithLlm(image, mediaType);
          const fallback = documentFromText(text);
          if (!doc || wordCount(fallback) > wordCount(doc) * 0.5) {
            doc = wordCount(fallback) > 0 ? fallback : doc;
          }
        } catch (error) {
          console.error("LLM đọc ảnh lỗi:", error instanceof Error ? error.message : error);
          if (!doc) return json({ status: "unavailable" });
        }
      }
      if (!doc) return json({ status: visionFailed ? "unavailable" : "no_text" });
      if (wordCount(doc) === 0) return json({ status: "no_text" });
      return json({ status: "ok", document: doc });
    } catch (error) {
      console.error("ocr-image lỗi:", error);
      return json({ status: "unavailable" });
    }
  };
}

// src/functions/ocr-image/main.ts
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
var visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
var vision = visionKey ? createVisionOcr({ apiKey: visionKey }) : null;
if (!vision) console.warn("Chưa có GOOGLE_VISION_API_KEY: chỉ đọc ảnh bằng LLM (nếu có khóa).");
var anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
var llm = anthropicKey ? createLlmRouter({
  config: resolveLlmConfig(Deno.env.toObject()),
  providers: { claude: createClaudeProvider({ apiKey: anthropicKey }) },
  logger: async (entry) => {
    const { error } = await supabase.from("llm_call_logs").insert(toLlmCallLogRow(entry));
    if (error) console.error("Ghi llm_call_logs lỗi:", error.message);
  }
}) : null;
var template = parsePromptTemplate(photo_ocr_default);
Deno.serve(
  createOcrHandler({
    vision,
    readWithLlm: llm ? async (image, mediaType) => {
      const { system, prompt } = buildPhotoOcrPrompt(template);
      const result = await llm.generateJSON("photo-ocr", {
        system,
        prompt,
        schema: PhotoTextSchema,
        images: [{ mediaType, data: image }]
      });
      return result.data.legible ? result.data.text : "";
    } : null,
    async getUserId(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
      if (!token) return null;
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async getPlan(userId) {
      const { data, error } = await supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`profiles: ${error.message}`);
      return data?.plan === "premium" ? "premium" : "free";
    },
    async consumeUsage(userId) {
      const { data, error } = await supabase.rpc("consume_usage", {
        p_user_id: userId,
        p_kind: "ocr"
      });
      if (error) throw new Error(`consume_usage: ${error.message}`);
      const result = data;
      return { allowed: result.allowed, dailyLimit: result.daily_limit };
    }
  })
);
