/**
 * Pipeline tạo nội dung từ (Prompt 2.1), không phụ thuộc Supabase hay Deno: database,
 * LLM, từ điển và đồng hồ đều truyền vào để test bằng bản giả.
 *
 *   requestWord()  – yêu cầu từ app: chuẩn hóa → có trong kho thì trả ngay → chưa có thì
 *                    xếp việc (khách: mời đăng nhập; hết lượt ngày: báo giới hạn).
 *   processJob()   – một việc: từ điển → LLM (Zod, gọi lại khi sai) → đối
 *                    chiếu IPA → lưu kho. Lỗi thì xếp lại, quá số lần thì thất bại hẳn.
 *   runWorker()    – nhận và xử lý việc cho đến khi hết việc hoặc sắp hết thời gian.
 *
 * Câu ngữ cảnh của người dùng không bao giờ vào đây: nội dung từ dùng chung cho mọi người.
 */
import {
  JOB_RETRY_DELAYS_MINUTES,
  MAX_JOB_ATTEMPTS,
  SHARED_CONTENT_CEFR,
  WORKER_MIN_REMAINING_MS,
  WORKER_TIME_BUDGET_MS,
} from "@/config/words";
import {
  dictionaryForPrompt,
  reconcileIpa,
  type DictionaryData,
} from "@/lib/dictionary/free-dictionary";
import { toLemma, type Lemmatizer } from "@/lib/entry/lemma";
import type { LlmRouter } from "@/lib/llm/router";
import type { PromptTemplate } from "@/lib/llm/prompt-template";
import { buildWordContentPrompt } from "@/lib/llm/tasks/word-content";
import { WordContentSchema, type Language, type Pos, type WordContent } from "@/lib/schema/word";
import { toWordRows, type WordRows } from "@/lib/schema/word-rows";
import type { StoredWord, WordRequest, WordResponse } from "./api";

export interface WordJob {
  id: string;
  language: Language;
  lemma: string;
  pos: Pos | null;
  source: "user" | "bulk";
  /** Số lần đã nhận việc, kể cả lần này. */
  attempts: number;
  frequencyRank: number | null;
}

export type RequestJobResult =
  | { limitReached: false; jobId: string; dailyLimit: number }
  | { limitReached: true; dailyLimit: number };

/** Lớp truy cập database (bản thật: supabase-store.ts). */
export interface WordStore {
  /** Các từ đã có; pos = null → mọi loại từ, phổ biến trước. */
  findWords(language: Language, lemma: string, pos: Pos | null): Promise<StoredWord[]>;
  findWordId(language: Language, lemma: string, pos: Pos): Promise<string | null>;
  requestJob(
    userId: string,
    language: Language,
    lemma: string,
    pos: Pos | null,
  ): Promise<RequestJobResult>;
  claimJobs(limit: number, jobId?: string): Promise<WordJob[]>;
  /** Lưu từ và đóng việc trong một transaction; trùng thì trả id bản đã có. */
  saveWord(jobId: string, rows: WordRows): Promise<string>;
  completeJob(jobId: string, wordId: string): Promise<void>;
  failJob(jobId: string, error: string, retryAt: Date | null): Promise<void>;
}

export type WordLlm = Pick<LlmRouter<"word-content">, "generateJSON">;

export interface PipelineDeps {
  store: WordStore;
  lemmatizer: Lemmatizer;
}

export interface WorkerDeps {
  store: WordStore;
  llm: WordLlm;
  template: PromptTemplate;
  fetchDictionary: (lemma: string) => Promise<DictionaryData | null>;
  newId: () => string;
  now?: () => number;
}

/* ---------- Yêu cầu từ app ---------- */

export async function requestWord(
  request: WordRequest,
  userId: string | null,
  deps: PipelineDeps,
): Promise<WordResponse> {
  const pos = request.pos ?? null;
  const { lemma, surface, alternatives } = toLemma(request.lemma, {
    language: request.language,
    pos,
    lemmatizer: deps.lemmatizer,
  });
  const base = { lemma, alternatives };

  const words = await deps.store.findWords(request.language, lemma, pos);
  if (words.length > 0) return { status: "ready", ...base, words };

  // Dạng người dùng gõ có thể đã có sẵn như một từ riêng (vd "building" được tạo trước).
  if (surface !== lemma) {
    const asTyped = await deps.store.findWords(request.language, surface, pos);
    if (asTyped.length > 0) {
      return {
        status: "ready",
        lemma: surface,
        alternatives: [lemma, ...alternatives.filter((a) => a !== surface)],
        words: asTyped,
      };
    }
  }

  // Khách không tạo được từ mới (không có tài khoản để đếm giới hạn, chống lạm dụng chi phí).
  if (!userId) return { status: "login_required", ...base };

  const job = await deps.store.requestJob(userId, request.language, lemma, pos);
  if (job.limitReached) return { status: "limit_reached", ...base, dailyLimit: job.dailyLimit };
  return { status: "preparing", ...base, jobId: job.jobId };
}

/* ---------- Worker ---------- */

/** Model đôi khi kèm dấu "/" quanh IPA dù prompt dặn không → bỏ trước khi validate. */
export function stripIpaSlashes(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("ipa" in raw)) return raw;
  const ipa = (raw as { ipa: unknown }).ipa;
  if (typeof ipa !== "object" || ipa === null) return raw;
  const cleaned = Object.fromEntries(
    Object.entries(ipa).map(([region, value]) => [
      region,
      typeof value === "string" ? value.replace(/^\s*\/+|\/+\s*$/g, "").trim() : value,
    ]),
  );
  return { ...raw, ipa: cleaned };
}

/** Schema cho đầu ra LLM: thêm kiểm tra đúng từ, đúng loại từ đã yêu cầu. */
function contentSchemaFor(job: WordJob, pos: Pos | null) {
  return WordContentSchema.refine(
    (content) =>
      content.language === job.language &&
      content.lemma.trim().toLowerCase() === job.lemma &&
      (pos === null || content.pos === pos),
    { message: `Phải đúng từ "${job.lemma}"${pos ? ` (${pos})` : ""}, ngôn ngữ ${job.language}` },
  );
}

export function retryDelayMs(attempts: number): number {
  const minutes =
    JOB_RETRY_DELAYS_MINUTES[Math.min(attempts, JOB_RETRY_DELAYS_MINUTES.length) - 1] ??
    JOB_RETRY_DELAYS_MINUTES[0];
  return minutes * 60_000;
}

export type JobOutcome =
  | { status: "done"; wordId: string; created: boolean; ipaReplaced: ("us" | "uk")[] }
  | { status: "retry"; error: string; retryAt: Date }
  | { status: "failed"; error: string };

export async function processJob(job: WordJob, deps: WorkerDeps): Promise<JobOutcome> {
  const now = deps.now ?? Date.now;
  try {
    const dictionary = job.language === "en" ? await deps.fetchDictionary(job.lemma) : null;
    // Không ghi loại từ → model chọn loại phổ biến nhất (thứ tự từ điển không theo tần suất).
    const pos = job.pos;

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
      dictionary: dictionaryForPrompt(dictionary, pos),
    });
    const result = await deps.llm.generateJSON("word-content", {
      system,
      prompt,
      schema: contentSchemaFor(job, pos),
      preprocess: stripIpaSlashes,
    });

    const generated: WordContent = { ...result.data, lemma: job.lemma };
    const { content, replaced } = reconcileIpa(generated, dictionary);

    // Không biết trước loại từ → model chọn; loại đó có thể đã có trong kho.
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
      reviewed: false,
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

/**
 * Nhận từng việc một và xử lý, dừng khi hết việc hoặc thời gian còn lại không đủ cho một từ.
 * `jobId`: xử lý đúng việc vừa xếp trước (gọi ngay sau requestWord), rồi làm tiếp việc khác.
 */
export async function runWorker(
  deps: WorkerDeps,
  options: { jobId?: string; budgetMs?: number; maxJobs?: number } = {},
): Promise<JobOutcome[]> {
  const now = deps.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? WORKER_TIME_BUDGET_MS);
  const maxJobs = options.maxJobs ?? Number.POSITIVE_INFINITY;
  const outcomes: JobOutcome[] = [];
  let jobId = options.jobId;

  while (outcomes.length < maxJobs && deadline - now() >= WORKER_MIN_REMAINING_MS) {
    const targeted = jobId !== undefined;
    const [job] = await deps.store.claimJobs(1, jobId);
    jobId = undefined;
    if (!job) {
      // Việc được chỉ định đã có worker khác nhận → vẫn làm tiếp việc khác đang chờ.
      if (targeted) continue;
      break;
    }
    outcomes.push(await processJob(job, deps));
  }
  return outcomes;
}
