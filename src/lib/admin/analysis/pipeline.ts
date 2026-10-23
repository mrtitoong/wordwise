/**
 * Pipeline phân tích danh sách Admin (Prompt 7.2), không phụ thuộc Supabase hay Deno: database,
 * LLM và đồng hồ truyền vào để test bằng bản giả.
 *
 * Mỗi lượt worker nhận một việc, chạy từng phần của bước hiện tại và ghi kết quả (bảng
 * curated_list_candidates + import_jobs) sau mỗi phần, nên dừng giữa chừng hay lỗi đều chạy lại
 * được từ đúng chỗ đó:
 *   extract   – nguồn → dòng thô (bài đọc: Sonnet trích từ theo đoạn, song song)
 *   normalize – từ gốc, gộp trùng, tra kho; từ chưa có: Haiku xem trước chính tả/CEFR/độ hiếm;
 *               lọc theo trình độ
 *   sense     – chọn nghĩa cho từ đã có trong kho (Haiku khi có câu ngữ cảnh)
 *   content   – từ chưa có: xếp việc generate-word (nguồn admin), chờ xong rồi chọn nghĩa
 *   order     – chủ đề con (tag của file hoặc Haiku) và thứ tự
 *   warn      – cảnh báo, ghi mục danh sách, chuyển Chờ duyệt
 */
import type { z } from "zod";
import type { Lemmatizer } from "@/lib/entry/lemma";
import { estimateCostUsd } from "@/lib/llm/cost";
import type { PromptTemplate } from "@/lib/llm/prompt-template";
import type { LlmRouter } from "@/lib/llm/router";
import {
  buildListAnalyzerPrompt,
  buildSensePickerPrompt,
  buildSubtopicsPrompt,
  buildTriagePrompt,
  ExtractedItemsSchema,
  SENSE_BATCH,
  SensePicksSchema,
  SUBTOPIC_BATCH,
  SubtopicsSchema,
  TRIAGE_BATCH,
  TriageSchema,
  type SensePickInput,
} from "@/lib/llm/tasks/list-analysis";
import type { Language, Pos } from "@/lib/schema/word";
import { chunkDocument, rawFromExtracted, rawFromRows } from "./extract";
import {
  applyLevelFilter,
  applyTriage,
  attachLibrary,
  dropDuplicates,
  lemmatize,
  lookupTerms,
  mergeCandidates,
} from "./normalize";
import {
  MIN_ITEMS_FOR_SUBTOPICS,
  orderCandidates,
  subtopicCount,
  subtopicsFromLlm,
  subtopicsFromTags,
} from "./order";
import { applyPick, pickFromLlm, pickLocally, senseOptions, type SenseOption } from "./senses";
import type {
  AnalysisJob,
  AnalysisStep,
  AnalysisSummary,
  Candidate,
  JobState,
  LibraryWord,
  SourceRecord,
  Usage,
} from "./types";
import { summarize, warningsFor } from "./warnings";

/* ---------- Thông số ---------- */

/** Thời gian một lượt worker (Edge Function bị dừng sau 150 giây ở gói Free). */
export const LIST_WORKER_BUDGET_MS = 140_000;
/** Không bắt đầu phần việc có gọi LLM khi còn ít hơn mức này (Sonnet trích một đoạn ~60 giây). */
export const LLM_MIN_REMAINING_MS = 75_000;
/** Phần việc không gọi LLM (tra kho, sắp xếp) cần ít nhất ngần này. */
export const PLAIN_MIN_REMAINING_MS = 15_000;
/** Chờ tạo nội dung: hỏi lại sau ngần này giây. */
export const CONTENT_POLL_SECONDS = 10;
/** Số lượt LLM chạy song song trong một phần việc. */
export const DOCUMENT_PARALLEL = 6;
export const TRIAGE_PARALLEL = 3;
export const SENSE_PARALLEL = 5;
/**
 * Số lượt gọi LLM tối đa trong một lượt worker. Edge Function còn giới hạn ~2 giây CPU mỗi lượt
 * và CPU tăng theo độ dài câu trả lời: đo trên cloud, một lượt chia chủ đề 300 từ (~7.400 token
 * đầu ra) đã dùng ~3,3 giây CPU, bị dừng "CPU Time exceeded" và làm lại mãi. Hết lượt thì lưu
 * tiến độ, lượt worker mới làm tiếp.
 */
export const MAX_LLM_CALLS_PER_RUN = 2;
/**
 * Mỗi lượt worker chỉ chạy ngần này phần việc (rồi gọi lượt mới) để CPU mỗi lượt luôn nhỏ:
 * đo trên cloud, lượt chạy liền nhiều bước với 500 từ dùng 3–47 giây CPU và bị dừng.
 */
export const MAX_STEPS_PER_RUN = 1;
/** Số từ xếp việc tạo nội dung mỗi lần gọi database. */
export const ENQUEUE_BATCH = 200;

/* ---------- Phụ thuộc ---------- */

export type JobPatch = {
  step: AnalysisStep;
  done: number;
  total: number;
  state: JobState;
  usage?: Usage;
  waitSeconds?: number;
  /** Còn làm tiếp trong lượt này: giữ khóa để worker khác không nhận. */
  keepLock?: boolean;
};

export type WordJobStatus = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  wordId: string | null;
  usage: Usage;
};

export interface AnalysisStore {
  claimJob(): Promise<AnalysisJob | null>;
  saveJob(jobId: string, patch: JobPatch): Promise<void>;
  /** "retry": thử lại sau 1 phút; "failed": quá 3 lần, danh sách về Nháp. */
  failJob(jobId: string, error: string): Promise<"retry" | "failed" | null>;
  loadSources(listId: string): Promise<SourceRecord[]>;
  loadCandidates(jobId: string): Promise<Candidate[]>;
  /** replaceRaw: xóa dòng thô của việc trong cùng transaction (bước chuẩn hóa). */
  saveCandidates(jobId: string, rows: readonly Candidate[], replaceRaw?: boolean): Promise<void>;
  /** Mọi từ trong kho (mọi loại từ) có lemma thuộc danh sách. */
  findWords(language: Language, lemmas: readonly string[]): Promise<LibraryWord[]>;
  getWords(ids: readonly string[]): Promise<LibraryWord[]>;
  enqueueWords(
    language: Language,
    items: readonly { key: string; lemma: string; pos: Pos | null }[],
  ): Promise<{ key: string; jobId: string | null; wordId: string | null; created: boolean }[]>;
  wordJobs(ids: readonly string[]): Promise<WordJobStatus[]>;
  /** Gọi thêm worker generate-word ngay (không chờ pg_cron). */
  kickWordWorkers(): Promise<void>;
  finish(jobId: string, summary: AnalysisSummary): Promise<number>;
}

export type AnalysisTask = "list-analyzer" | "list-triage" | "sense-picker" | "list-subtopics";

export type AnalysisLlm = Pick<LlmRouter<AnalysisTask>, "generateJSON">;

export interface AnalysisDeps {
  store: AnalysisStore;
  llm: AnalysisLlm;
  templates: Record<AnalysisTask, PromptTemplate>;
  lemmatizer: Lemmatizer;
  newId: () => string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/* ---------- Ngữ cảnh một lượt ---------- */

type Ctx = {
  deps: AnalysisDeps;
  job: AnalysisJob;
  now: () => number;
  deadline: number;
  usage: Usage;
  /** Số lượt gọi LLM đã dùng trong lượt worker này (dùng chung giữa các bước). */
  calls: { count: number };
};

type StepResult =
  | { finished: true }
  | {
      finished?: false;
      step: AnalysisStep;
      done: number;
      total: number;
      state?: JobState;
      wait?: boolean;
    };

function hasTime(ctx: Ctx, ms: number): boolean {
  return ctx.deadline - ctx.now() >= ms;
}

/** Còn được gọi bao nhiêu lượt LLM (tối đa `wanted`) trong lượt worker này. */
function llmSlots(ctx: Ctx, wanted: number): number {
  if (!hasTime(ctx, LLM_MIN_REMAINING_MS)) return 0;
  return Math.max(0, Math.min(wanted, MAX_LLM_CALLS_PER_RUN - ctx.calls.count));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function addUsage(target: Usage, usage: Usage) {
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.costUsd += usage.costUsd;
}

async function callLlm<T>(
  ctx: Ctx,
  task: AnalysisTask,
  build: (template: PromptTemplate) => { system: string; prompt: string },
  schema: z.ZodType<T>,
): Promise<T> {
  const { system, prompt } = build(ctx.deps.templates[task]);
  ctx.calls.count += 1;
  const result = await ctx.deps.llm.generateJSON(task, { system, prompt, schema });
  addUsage(ctx.usage, {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    costUsd: estimateCostUsd(result.model, result.usage),
  });
  return result.data as T;
}

function byLemma(words: readonly LibraryWord[]): Map<string, LibraryWord[]> {
  const map = new Map<string, LibraryWord[]>();
  for (const w of words) map.set(w.lemma, [...(map.get(w.lemma) ?? []), w]);
  return map;
}

const isKept = (c: Candidate) => c.dropped === null;

/* ---------- Bước 1: trích xuất ---------- */

async function extract(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const sources = await deps.store.loadSources(job.listId);
  const cursor = job.state.extract ?? { source: 0, chunk: 0, position: 0 };
  const state = (next: typeof cursor): JobState => ({ ...job.state, extract: next });

  const source = sources[cursor.source];
  if (!source) return { step: "normalize", done: 0, total: 0, state: state(cursor) };

  if (source.kind !== "document") {
    const rows = rawFromRows(source, cursor.position, deps.newId);
    await deps.store.saveCandidates(job.id, rows);
    return {
      step: "extract",
      done: cursor.source + 1,
      total: sources.length,
      state: state({
        source: cursor.source + 1,
        chunk: 0,
        position: cursor.position + rows.length,
      }),
    };
  }

  const parts = chunkDocument(source.text);
  if (cursor.chunk >= parts.length) {
    return {
      step: "extract",
      done: cursor.source + 1,
      total: sources.length,
      state: state({ source: cursor.source + 1, chunk: 0, position: cursor.position }),
    };
  }
  const batch = parts.slice(
    cursor.chunk,
    cursor.chunk + Math.max(1, llmSlots(ctx, DOCUMENT_PARALLEL)),
  );
  const results = await Promise.all(
    batch.map((text) =>
      callLlm(
        ctx,
        "list-analyzer",
        (template) =>
          buildListAnalyzerPrompt(template, {
            title: job.list.title,
            topic: job.list.topic,
            targetCefr: job.list.targetCefr,
            minCefr: job.options.min_cefr ?? null,
            text,
          }),
        ExtractedItemsSchema,
      ),
    ),
  );
  let position = cursor.position;
  const rows: Candidate[] = [];
  for (const result of results) {
    const extracted = rawFromExtracted(result.items, position, deps.newId);
    position += extracted.length;
    rows.push(...extracted);
  }
  await deps.store.saveCandidates(job.id, rows);
  const chunk = cursor.chunk + batch.length;
  return {
    step: "extract",
    done: chunk,
    total: parts.length,
    state: state({ source: cursor.source, chunk, position }),
  };
}

/* ---------- Bước 2: chuẩn hóa ---------- */

async function normalize(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const language = job.list.language;
  const rows = await deps.store.loadCandidates(job.id);
  const progress = (list: readonly Candidate[]) => ({
    done: list.filter((c) => c.stage === "triaged" && isKept(c)).length,
    total: list.filter(isKept).length,
  });

  // 2a. Dòng thô → từ gốc, gộp trùng, tra kho (một lần cho cả danh sách, không gọi LLM).
  const raw = rows.filter((c) => c.stage === "raw");
  if (raw.length > 0) {
    const merged = mergeCandidates([
      ...rows.filter((c) => c.stage !== "raw"),
      ...raw.map((c) => lemmatize(c, language, deps.lemmatizer)),
    ]);
    const words = await deps.store.findWords(language, [...new Set(merged.flatMap(lookupTerms))]);
    const library = byLemma(words);
    const next = dropDuplicates(merged.map((c) => attachLibrary(c, library)));
    await deps.store.saveCandidates(job.id, next, true);
    return { step: "normalize", ...progress(next) };
  }

  // 2b. Từ chưa có trong kho: LLM xem trước chính tả, CEFR, độ hiếm (theo lô).
  const pending = rows.filter((c) => c.stage === "merged" && isKept(c));
  if (pending.length > 0) {
    const batches = chunks(pending, TRIAGE_BATCH).slice(
      0,
      Math.max(1, llmSlots(ctx, TRIAGE_PARALLEL)),
    );
    const results = await Promise.all(
      batches.map((batch) =>
        callLlm(
          ctx,
          "list-triage",
          (template) =>
            buildTriagePrompt(
              template,
              batch.map((c) => ({ key: c.id, word: c.lemma ?? c.surface, hint: c.meaningHint })),
            ),
          TriageSchema,
        ),
      ),
    );
    const byKey = new Map(results.flatMap((r) => r.items).map((item) => [item.key, item]));
    let updated = batches
      .flat()
      .map((c) => applyTriage(c, byKey.get(c.id), language, deps.lemmatizer));
    // Từ đã sửa chính tả có thể đã có trong kho.
    const corrected = updated.filter((c) => c.spellingFrom && isKept(c));
    if (corrected.length > 0) {
      const library = byLemma(
        await deps.store.findWords(language, [...new Set(corrected.flatMap(lookupTerms))]),
      );
      updated = updated.map((c) => (c.spellingFrom ? attachLibrary(c, library) : c));
    }
    await deps.store.saveCandidates(job.id, updated);
    const ids = new Map(updated.map((c) => [c.id, c]));
    return { step: "normalize", ...progress(rows.map((c) => ids.get(c.id) ?? c)) };
  }

  // 2c. Lọc theo trình độ; sửa chính tả có thể sinh dòng trùng.
  const filtered = dropDuplicates(rows.map((c) => applyLevelFilter(c, job.options.min_cefr)));
  const before = new Map(rows.map((c) => [c.id, c]));
  const changed = filtered.filter((c) => {
    const old = before.get(c.id)!;
    return old.dropped !== c.dropped || old.occurrences !== c.occurrences;
  });
  if (changed.length > 0) await deps.store.saveCandidates(job.id, changed);
  return {
    step: "sense",
    done: 0,
    total: filtered.filter((c) => isKept(c) && c.wordId).length,
  };
}

/* ---------- Bước 3: chọn nghĩa ---------- */

/**
 * Chọn nghĩa cho các dòng đã có từ trong kho nhưng chưa có nghĩa: quyết định ngay nếu được,
 * phần cần LLM chạy tối đa SENSE_PARALLEL lô; còn lại để lượt sau. Trả về các dòng đã đổi.
 */
async function pickSenses(ctx: Ctx, todo: readonly Candidate[]): Promise<Candidate[]> {
  if (todo.length === 0) return [];
  const { deps, job } = ctx;
  const words = await deps.store.findWords(job.list.language, [
    ...new Set(todo.map((c) => c.lemma!)),
  ]);
  const attachedIds = todo.map((c) => c.wordId!).filter((id) => !words.some((w) => w.id === id));
  if (attachedIds.length > 0) words.push(...(await deps.store.getWords(attachedIds)));

  const changed: Candidate[] = [];
  const llmQueue: { candidate: Candidate; input: SensePickInput; options: SenseOption[] }[] = [];
  for (const c of todo) {
    const local = pickLocally(c, senseOptions(c, words));
    if (local.kind === "decided") changed.push(applyPick(c, local));
    else if (local.kind === "llm") llmQueue.push({ candidate: c, ...local });
    // Từ trong kho không có nghĩa nào (dữ liệu hỏng): không dùng được.
    else changed.push({ ...c, dropped: "content_failed" });
  }

  const slots = llmSlots(ctx, SENSE_PARALLEL);
  if (llmQueue.length > 0 && slots > 0) {
    const batches = chunks(llmQueue, SENSE_BATCH).slice(0, slots);
    const results = await Promise.all(
      batches.map((batch) =>
        callLlm(
          ctx,
          "sense-picker",
          (template) =>
            buildSensePickerPrompt(
              template,
              batch.map((b) => b.input),
            ),
          SensePicksSchema,
        ),
      ),
    );
    const picks = new Map(results.flatMap((r) => r.picks).map((p) => [p.key, p]));
    for (const { candidate, options } of batches.flat()) {
      changed.push(applyPick(candidate, pickFromLlm(options, picks.get(candidate.id))));
    }
  }
  return changed;
}

async function sense(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const rows = await deps.store.loadCandidates(job.id);
  const withWord = rows.filter((c) => isKept(c) && c.wordId);
  const todo = withWord.filter((c) => !c.senseId);
  if (todo.length === 0) {
    return {
      step: "content",
      done: 0,
      total: rows.filter((c) => isKept(c) && !c.wordId).length,
    };
  }
  const changed = await pickSenses(ctx, todo);
  await deps.store.saveCandidates(job.id, changed);
  return {
    step: "sense",
    done: withWord.length - todo.length + changed.filter((c) => c.senseId).length,
    total: withWord.length,
  };
}

/* ---------- Bước 4: nội dung ---------- */

async function content(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const language = job.list.language;
  const rows = new Map((await deps.store.loadCandidates(job.id)).map((c) => [c.id, c]));
  const update = (c: Candidate) => rows.set(c.id, c);
  const changed = new Set<string>();

  // Xếp việc cho từ chưa có (từ có thể vừa được người khác tạo → gắn luôn).
  const toEnqueue = [...rows.values()].filter((c) => isKept(c) && !c.wordId && !c.wordJobId);
  for (const batch of chunks(toEnqueue, ENQUEUE_BATCH)) {
    const results = await deps.store.enqueueWords(
      language,
      batch.map((c) => ({ key: c.id, lemma: c.lemma!, pos: c.pos })),
    );
    for (const r of results) {
      const c = rows.get(r.key);
      if (!c) continue;
      if (r.wordId) update({ ...c, wordId: r.wordId });
      else if (r.jobId) update({ ...c, wordJobId: r.jobId, jobCreated: r.created });
      else update({ ...c, dropped: "content_failed" });
      changed.add(r.key);
    }
  }

  const waiting = [...rows.values()].filter((c) => isKept(c) && !c.wordId && c.wordJobId);
  if (waiting.length > 0) {
    await deps.store.kickWordWorkers();
    const statuses = new Map(
      (await deps.store.wordJobs([...new Set(waiting.map((c) => c.wordJobId!))])).map((s) => [
        s.id,
        s,
      ]),
    );
    for (const c of waiting) {
      const s = statuses.get(c.wordJobId!);
      if (!s) continue;
      if (s.status === "done" && s.wordId) {
        update({ ...c, wordId: s.wordId });
        if (c.jobCreated) addUsage(ctx.usage, s.usage);
      } else if (s.status === "failed" || s.status === "done") {
        update({ ...c, dropped: "content_failed" });
      } else continue;
      changed.add(c.id);
    }
  }

  // Từ vừa có nội dung → chọn nghĩa (như bước 3).
  const needSense = [...rows.values()].filter((c) => isKept(c) && c.wordId && !c.senseId);
  for (const c of await pickSenses(ctx, needSense)) {
    update(c);
    changed.add(c.id);
  }

  if (changed.size > 0) {
    await deps.store.saveCandidates(
      job.id,
      [...changed].map((id) => rows.get(id)!),
    );
  }

  const all = [...rows.values()];
  const handled = all.filter((c) => c.wordJobId || c.dropped === "content_failed");
  const progress = {
    done: handled.filter((c) => c.dropped === "content_failed" || c.senseId).length,
    total: handled.length,
  };
  const stillWaiting = all.filter((c) => isKept(c) && !c.wordId).length;
  const stillSense = all.filter((c) => isKept(c) && c.wordId && !c.senseId).length;
  if (stillWaiting === 0 && stillSense === 0) {
    return { step: "order", done: 0, total: all.filter((c) => isKept(c) && c.senseId).length };
  }
  return { step: "content", ...progress, wait: stillSense === 0 };
}

/* ---------- Bước 5: sắp xếp ---------- */

async function order(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const rows = await deps.store.loadCandidates(job.id);
  const kept = rows.filter((c) => isKept(c) && c.senseId).sort((a, b) => a.position - b.position);

  const fromTags = subtopicsFromTags(kept);
  let topics = new Map<string, string>();
  if (fromTags) {
    topics = fromTags;
  } else if (kept.length >= MIN_ITEMS_FOR_SUBTOPICS) {
    // Lô sau lần lượt (cần tên chủ đề của lô trước). Tiến độ lưu sau mỗi lượt worker
    // (state.order) để lượt mới làm tiếp, không làm lại từ đầu.
    const batches = chunks(kept, SUBTOPIC_BATCH);
    const progress = job.state.order ?? { next: 0, topics: {}, existing: [] };
    const found: Record<string, string> = { ...progress.topics };
    const existing = [...progress.existing];
    let next = progress.next;
    if (next < batches.length) {
      const words = new Map(
        (await deps.store.getWords(kept.map((c) => c.wordId!))).map((w) => [w.id, w]),
      );
      const meaningOf = (c: Candidate) =>
        words.get(c.wordId!)?.senses.find((s) => s.id === c.senseId)?.meaningVi ?? "";
      const groupCount = subtopicCount(kept.length);
      while (next < batches.length && llmSlots(ctx, 1) > 0) {
        const batch = batches[next]!;
        const result = await callLlm(
          ctx,
          "list-subtopics",
          (template) =>
            buildSubtopicsPrompt(template, {
              title: job.list.title,
              topic: job.list.topic,
              groupCount: Math.max(2, Math.round((groupCount * batch.length) / kept.length)),
              existing,
              items: batch.map((c, i) => ({ i, w: c.lemma ?? c.surface, m: meaningOf(c) })),
            }),
          SubtopicsSchema,
        );
        for (const [id, topic] of subtopicsFromLlm(
          batch.map((c) => c.id),
          result,
        )) {
          found[id] = topic;
          if (!existing.includes(topic)) existing.push(topic);
        }
        next += 1;
      }
      // Đã gọi LLM trong lượt này: lưu rồi để lượt mới sắp xếp (tải 500 từ, ghi 500 dòng sau
      // lượt LLM cuối từng vượt giới hạn CPU).
      if (next < batches.length || ctx.calls.count > 0) {
        return {
          step: "order",
          done: next,
          total: batches.length,
          state: { ...job.state, order: { next, topics: found, existing } },
        };
      }
    }
    topics = new Map(Object.entries(found));
  }

  const words = new Map(
    (await deps.store.getWords(kept.map((c) => c.wordId!))).map((w) => [w.id, w]),
  );
  const ordered = orderCandidates(
    kept.map((c) => ({ ...c, subtopic: topics.get(c.id) ?? null })),
    words,
  );
  await deps.store.saveCandidates(job.id, ordered);
  return { step: "warn", done: 0, total: ordered.length };
}

/* ---------- Bước 6: cảnh báo, ghi danh sách ---------- */

async function warn(ctx: Ctx): Promise<StepResult> {
  const { deps, job } = ctx;
  const rows = await deps.store.loadCandidates(job.id);
  const kept = rows.filter((c) => isKept(c) && c.senseId);
  const words = new Map(
    (await deps.store.getWords(kept.map((c) => c.wordId!))).map((w) => [w.id, w]),
  );
  const warned = kept.map((c) => ({
    ...c,
    warnings: warningsFor(c, words.get(c.wordId!), job.list),
  }));
  await deps.store.saveCandidates(job.id, warned);
  const ids = new Map(warned.map((c) => [c.id, c]));
  const summary = summarize(
    rows.map((c) => ids.get(c.id) ?? c),
    job.state.startedAt,
    ctx.now(),
  );
  // Chi phí bước trước đã ghi; ghi nốt phần (nếu có) trước khi đóng việc.
  if (ctx.usage.costUsd > 0 || ctx.usage.inputTokens > 0) {
    await deps.store.saveJob(job.id, {
      step: "warn",
      done: warned.length,
      total: warned.length,
      state: job.state,
      usage: ctx.usage,
      keepLock: true,
    });
  }
  await deps.store.finish(job.id, summary);
  return { finished: true };
}

const STEPS: Record<AnalysisStep, (ctx: Ctx) => Promise<StepResult>> = {
  extract,
  normalize,
  sense,
  content,
  order,
  warn,
};

/** Bước có gọi LLM cần nhiều thời gian còn lại hơn. */
const LLM_STEPS = new Set<AnalysisStep>(["extract", "normalize", "sense", "content", "order"]);

/* ---------- Chạy ---------- */

export type AdvanceOutcome =
  /** Xong cả danh sách (Chờ duyệt). */
  | "finished"
  /** Đang chờ tạo nội dung: nhận lại sau CONTENT_POLL_SECONDS. */
  | "wait"
  /** Hết giờ giữa chừng: cần lượt worker mới. */
  | "continue";

/** Chạy việc qua các bước cho tới khi xong, phải chờ, hoặc sắp hết giờ. */
export async function advanceJob(
  job: AnalysisJob,
  deps: AnalysisDeps,
  deadline: number,
): Promise<AdvanceOutcome> {
  const now = deps.now ?? Date.now;
  let current: AnalysisJob = job.state.startedAt
    ? job
    : { ...job, state: { ...job.state, startedAt: new Date(now()).toISOString() } };
  const calls = { count: 0 };
  let steps = 0;

  for (;;) {
    const ctx: Ctx = {
      deps,
      job: current,
      now,
      deadline,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      calls,
    };
    const llmStep = LLM_STEPS.has(current.step);
    const need = llmStep ? LLM_MIN_REMAINING_MS : PLAIN_MIN_REMAINING_MS;
    if (!hasTime(ctx, need) || (llmStep && calls.count >= MAX_LLM_CALLS_PER_RUN)) {
      await deps.store.saveJob(current.id, {
        step: current.step,
        done: current.done,
        total: current.total,
        state: current.state,
      });
      return "continue";
    }

    const started = now();
    const result = await STEPS[current.step](ctx);
    console.info(
      `analyze-list ${current.id}: ${current.step} → ${result.finished ? "xong" : result.step}` +
        ` (${now() - started} ms, ${calls.count} lượt LLM)`,
    );
    if (result.finished) return "finished";

    steps += 1;
    const more = !result.wait && steps < MAX_STEPS_PER_RUN;
    const state = result.state ?? current.state;
    await deps.store.saveJob(current.id, {
      step: result.step,
      done: result.done,
      total: result.total,
      state,
      usage: ctx.usage,
      ...(result.wait ? { waitSeconds: CONTENT_POLL_SECONDS } : more ? { keepLock: true } : {}),
    });
    if (result.wait) return "wait";
    if (!more) return "continue";
    current = { ...current, step: result.step, done: result.done, total: result.total, state };
  }
}

export type WorkerRun = { jobId: string; outcome: AdvanceOutcome | "retry" | "failed" };

/**
 * Một lượt worker: nhận việc và chạy tới khi hết giờ. Việc đang chờ tạo nội dung thì ngủ
 * CONTENT_POLL_SECONDS rồi nhận lại (vẫn trong lượt này nếu còn giờ).
 */
export async function runListWorker(
  deps: AnalysisDeps,
  options: { budgetMs?: number } = {},
): Promise<{ runs: WorkerRun[]; more: boolean }> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + (options.budgetMs ?? LIST_WORKER_BUDGET_MS);
  const runs: WorkerRun[] = [];
  let waited = false;

  while (deadline - now() >= PLAIN_MIN_REMAINING_MS) {
    const job = await deps.store.claimJob();
    if (!job) {
      const pause = CONTENT_POLL_SECONDS * 1000;
      if (waited && deadline - now() >= pause + PLAIN_MIN_REMAINING_MS) {
        waited = false;
        await sleep(pause);
        continue;
      }
      break;
    }
    let outcome: WorkerRun["outcome"];
    try {
      outcome = await advanceJob(job, deps, deadline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Phân tích danh sách ${job.listId} lỗi ở bước ${job.step}:`, message);
      outcome = (await deps.store.failJob(job.id, message)) ?? "failed";
    }
    runs.push({ jobId: job.id, outcome });
    // Không đủ giờ cho phần tiếp theo: để lượt mới làm (nhận lại ngay sẽ lặp không tiến).
    if (outcome === "continue") break;
    waited = outcome === "wait";
  }
  return { runs, more: runs.some((r) => r.outcome === "continue") };
}
