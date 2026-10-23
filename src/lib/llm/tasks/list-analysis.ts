/**
 * Tác vụ LLM của pipeline phân tích danh sách Admin (Prompt 7.2):
 *   list-analyzer  – trích từ cần học từ một đoạn bài đọc (Sonnet).
 *   list-triage    – chính tả, CEFR, độ hiếm của từ chưa có trong kho (Haiku).
 *   sense-picker   – chọn nghĩa theo câu ngữ cảnh (Haiku).
 *   list-subtopics – chia chủ đề con (Haiku).
 */
import { z } from "zod";
import { CefrSchema, PosSchema } from "@/lib/schema/word";
import { renderTemplate, type PromptTemplate } from "../prompt-template";

function expectTask(template: PromptTemplate, task: string) {
  if (template.task !== task) throw new Error(`Cần prompt ${task}, nhận ${template.task}`);
}

/** Bỏ ký tự có thể phá khung thẻ dữ liệu trong prompt. */
function safeText(text: string): string {
  return text.replace(/<\/?(document|words|items)>/gi, " ");
}

/* ---------- list-analyzer ---------- */

export const MAX_EXTRACTED_PER_CHUNK = 80;

export const ExtractedItemsSchema = z.object({
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(64),
        pos: PosSchema.nullable().catch(null),
        sentence: z.string().max(400).nullable().catch(null),
        cefr: CefrSchema.nullable().catch(null),
      }),
    )
    .max(MAX_EXTRACTED_PER_CHUNK * 2),
});

export type ExtractedItems = z.infer<typeof ExtractedItemsSchema>;

export function buildListAnalyzerPrompt(
  template: PromptTemplate,
  input: {
    title: string;
    topic: string | null;
    targetCefr: string | null;
    minCefr: string | null;
    text: string;
  },
): { system: string; prompt: string } {
  expectTask(template, "list-analyzer");
  const vars = {
    title: input.title.replaceAll('"', "'"),
    topic: input.topic?.trim() || "không ghi",
    target_cefr: input.targetCefr ?? "không ghi",
    level_rule: input.minCefr
      ? `Chỉ lấy từ có CEFR từ ${input.minCefr} trở lên.`
      : "Không giới hạn trình độ, nhưng bỏ từ A1.",
    max_items: String(MAX_EXTRACTED_PER_CHUNK),
    text: safeText(input.text),
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
  };
}

/* ---------- list-triage ---------- */

export const TRIAGE_BATCH = 100;

export const TriageSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      valid: z.boolean(),
      correction: z.string().trim().max(64).nullable().catch(null),
      cefr: CefrSchema.nullable().catch(null),
      rare: z.boolean().catch(false),
    }),
  ),
});

export type Triage = z.infer<typeof TriageSchema>;

export function buildTriagePrompt(
  template: PromptTemplate,
  items: readonly { key: string; word: string; hint: string | null }[],
): { system: string; prompt: string } {
  expectTask(template, "list-triage");
  const vars = {
    items_json: safeText(
      JSON.stringify(
        items.map((i) => (i.hint ? { key: i.key, word: i.word, hint: i.hint.slice(0, 120) } : i)),
      ),
    ),
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
  };
}

/* ---------- sense-picker ---------- */

export const SENSE_BATCH = 20;

export const SensePicksSchema = z.object({
  picks: z.array(
    z.object({
      key: z.string(),
      n: z.number().int().min(1).max(20),
      confidence: z.number().min(0).max(1).catch(0.5),
    }),
  ),
});

export type SensePicks = z.infer<typeof SensePicksSchema>;

export type SensePickInput = {
  key: string;
  word: string;
  sentence: string;
  senses: readonly { definitionEn: string; meaningVi: string }[];
};

export function buildSensePickerPrompt(
  template: PromptTemplate,
  items: readonly SensePickInput[],
): { system: string; prompt: string } {
  expectTask(template, "sense-picker");
  const vars = {
    items_json: safeText(
      JSON.stringify(
        items.map((i) => ({
          key: i.key,
          word: i.word,
          sentence: i.sentence,
          senses: i.senses.map((s, index) => ({
            n: index + 1,
            definition_en: s.definitionEn,
            meaning_vi: s.meaningVi,
          })),
        })),
      ),
    ),
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
  };
}

/* ---------- list-subtopics ---------- */

export const SUBTOPIC_BATCH = 300;

export const SubtopicsSchema = z.object({
  topics: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  items: z.array(z.object({ i: z.number().int().min(0), t: z.number().int().min(0) })),
});

export type Subtopics = z.infer<typeof SubtopicsSchema>;

export function buildSubtopicsPrompt(
  template: PromptTemplate,
  input: {
    title: string;
    topic: string | null;
    groupCount: number;
    existing: readonly string[];
    items: readonly { i: number; w: string; m: string }[];
  },
): { system: string; prompt: string } {
  expectTask(template, "list-subtopics");
  const vars = {
    title: input.title.replaceAll('"', "'"),
    topic: input.topic?.trim() || "không ghi",
    group_count: String(input.groupCount),
    existing_rule: input.existing.length
      ? `Dùng lại đúng tên các chủ đề đã có nếu hợp (đặt trước trong topics): ${JSON.stringify(input.existing)}.`
      : "",
    items_json: safeText(JSON.stringify(input.items)),
  };
  return {
    system: renderTemplate(template.system, vars),
    prompt: renderTemplate(template.user, vars),
  };
}
