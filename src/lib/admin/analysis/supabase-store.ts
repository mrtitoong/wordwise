/**
 * AnalysisStore trên Supabase (service role, chỉ dùng trong Edge Function analyze-list).
 * Logic hàng đợi nằm trong các hàm SQL (supabase/migrations/*_list_pipeline.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/db/database.types";
import { CefrSchema, LanguageSchema, PosSchema, type Cefr, type Pos } from "@/lib/schema/word";
import type { AnalysisStore, WordJobStatus } from "./pipeline";
import type {
  AnalysisJob,
  AnalysisStep,
  Candidate,
  LibraryWord,
  SourceRecord,
  Warning,
} from "./types";

type Client = SupabaseClient<Database>;
type CandidateRow = Database["public"]["Tables"]["curated_list_candidates"]["Row"];

/** PostgREST trả tối đa 1.000 dòng mỗi lần. */
const PAGE = 1000;
const IN_BATCH = 200;

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const cefrOrNull = (value: unknown): Cefr | null => CefrSchema.safeParse(value).data ?? null;
const posOrNull = (value: unknown): Pos | null => PosSchema.safeParse(value).data ?? null;

export function fromCandidateRow(row: CandidateRow): Candidate {
  return {
    id: row.id,
    stage: row.stage as Candidate["stage"],
    position: row.position,
    surface: row.surface,
    lemma: row.lemma,
    pos: posOrNull(row.pos),
    contextSentence: row.context_sentence,
    meaningHint: row.meaning_hint,
    note: row.note,
    tags: row.tags,
    occurrences: row.occurrences,
    cefr: cefrOrNull(row.cefr),
    frequencyRank: row.frequency_rank,
    rare: row.rare,
    spellingFrom: row.spelling_from,
    wordId: row.word_id,
    senseId: row.sense_id,
    senseMethod: row.sense_method as Candidate["senseMethod"],
    senseConfidence: row.sense_confidence,
    wordJobId: row.word_job_id,
    jobCreated: row.job_created,
    subtopic: row.subtopic,
    itemOrder: row.item_order,
    dropped: row.dropped as Candidate["dropped"],
    warnings: (Array.isArray(row.warnings) ? row.warnings : []) as Warning[],
  };
}

export function toCandidateRow(c: Candidate) {
  return {
    id: c.id,
    stage: c.stage,
    position: c.position,
    surface: c.surface,
    lemma: c.lemma,
    pos: c.pos,
    context_sentence: c.contextSentence,
    meaning_hint: c.meaningHint,
    note: c.note,
    tags: c.tags,
    occurrences: c.occurrences,
    cefr: c.cefr,
    frequency_rank: c.frequencyRank,
    rare: c.rare,
    spelling_from: c.spellingFrom,
    word_id: c.wordId,
    sense_id: c.senseId,
    sense_method: c.senseMethod,
    sense_confidence: c.senseConfidence,
    word_job_id: c.wordJobId,
    job_created: c.jobCreated,
    subtopic: c.subtopic,
    item_order: c.itemOrder,
    dropped: c.dropped,
    warnings: c.warnings,
  };
}

type WordRow = {
  id: string;
  lemma: string;
  pos: string;
  cefr: string | null;
  frequency_rank: number | null;
  details: unknown;
  word_senses: { id: string; sense_order: number; definition_en: string; meaning_vi: string }[];
};

const WORD_SELECT =
  "id, lemma, pos, cefr, frequency_rank, details, word_senses (id, sense_order, definition_en, meaning_vi)";

function words(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) =>
    item && typeof item === "object" && typeof (item as { word?: unknown }).word === "string"
      ? [(item as { word: string }).word]
      : [],
  );
}

export function toLibraryWord(row: WordRow): LibraryWord | null {
  const pos = posOrNull(row.pos);
  if (!pos) return null;
  const details = (row.details ?? {}) as Record<string, unknown>;
  const scores =
    details.confidence && typeof details.confidence === "object"
      ? Object.values(details.confidence).filter((v): v is number => typeof v === "number")
      : [];
  return {
    id: row.id,
    lemma: row.lemma,
    pos,
    cefr: cefrOrNull(row.cefr),
    frequencyRank: row.frequency_rank,
    senses: [...row.word_senses]
      .sort((a, b) => a.sense_order - b.sense_order)
      .map((s) => ({ id: s.id, definitionEn: s.definition_en, meaningVi: s.meaning_vi })),
    family: words(details.word_family),
    confusables: words(details.confusables),
    confidence: scores.length ? Math.min(...scores) : null,
  };
}

function toJob(raw: Record<string, unknown>): AnalysisJob {
  const list = raw.list as Record<string, unknown>;
  const options = (raw.options ?? {}) as Record<string, unknown>;
  const minCefr = cefrOrNull(options.min_cefr);
  return {
    id: String(raw.id),
    listId: String(raw.list_id),
    step: raw.step as AnalysisStep,
    done: Number(raw.done),
    total: Number(raw.total),
    options: minCefr ? { min_cefr: minCefr } : {},
    state: (raw.state ?? {}) as AnalysisJob["state"],
    attempts: Number(raw.attempts),
    list: {
      language: LanguageSchema.parse(list.language),
      targetCefr: cefrOrNull(list.target_cefr),
      title: String(list.title ?? ""),
      topic: typeof list.topic === "string" ? list.topic : null,
      purpose: typeof list.purpose === "string" ? list.purpose : null,
    },
  };
}

function toSource(row: { id: string; kind: string; content: unknown }): SourceRecord | null {
  if (row.kind === "document") {
    const text = (row.content as { text?: unknown } | null)?.text;
    return typeof text === "string" ? { id: row.id, kind: "document", text } : null;
  }
  if (!Array.isArray(row.content)) return null;
  if (row.kind === "rows") {
    return {
      id: row.id,
      kind: "rows",
      rows: (row.content as Record<string, unknown>[]).map((r) => ({
        word: String(r.word ?? ""),
        meaning: typeof r.meaning === "string" ? r.meaning : null,
        example: typeof r.example === "string" ? r.example : null,
        note: typeof r.note === "string" ? r.note : null,
        tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
      })),
    };
  }
  return {
    id: row.id,
    kind: "lines",
    rows: (row.content as Record<string, unknown>[]).map((r) => ({
      word: String(r.word ?? ""),
      note: typeof r.note === "string" ? r.note : null,
    })),
  };
}

export function createSupabaseAnalysisStore(client: Client): AnalysisStore {
  async function selectWords(column: "lemma" | "id", values: readonly string[], language?: string) {
    const out: LibraryWord[] = [];
    for (const batch of chunks([...new Set(values)], IN_BATCH)) {
      let query = client.from("words").select(WORD_SELECT).in(column, batch).eq("is_hidden", false);
      if (language) query = query.eq("language", language);
      const rows = check(await query, "Đọc words") as unknown as WordRow[];
      for (const row of rows) {
        const word = toLibraryWord(row);
        if (word) out.push(word);
      }
    }
    return out;
  }

  return {
    async claimJob() {
      const data = check(await client.rpc("claim_list_job"), "Nhận việc phân tích");
      return data ? toJob(data as Record<string, unknown>) : null;
    },

    async saveJob(jobId, patch) {
      check(
        await client.rpc("save_list_job", {
          p_job_id: jobId,
          p_step: patch.step,
          p_done: patch.done,
          p_total: patch.total,
          p_state: patch.state as unknown as Json,
          p_input_tokens: patch.usage?.inputTokens ?? 0,
          p_output_tokens: patch.usage?.outputTokens ?? 0,
          p_cost_usd: patch.usage?.costUsd ?? 0,
          p_wait_seconds: patch.waitSeconds ?? 0,
          p_keep_lock: patch.keepLock ?? false,
        }),
        "Ghi tiến độ phân tích",
      );
    },

    async failJob(jobId, error) {
      const data = check(
        await client.rpc("fail_list_job", { p_job_id: jobId, p_error: error }),
        "Ghi lỗi phân tích",
      );
      return data === "retry" || data === "failed" ? data : null;
    },

    async loadSources(listId) {
      const rows =
        check(
          await client
            .from("curated_list_sources")
            .select("id, kind, content")
            .eq("list_id", listId)
            .order("created_at")
            .order("id"),
          "Đọc nguồn từ",
        ) ?? [];
      return rows.flatMap((row) => toSource(row) ?? []);
    },

    async loadCandidates(jobId) {
      const out: Candidate[] = [];
      for (let from = 0; ; from += PAGE) {
        const rows =
          check(
            await client
              .from("curated_list_candidates")
              .select("*")
              .eq("job_id", jobId)
              .order("position")
              .order("id")
              .range(from, from + PAGE - 1),
            "Đọc kết quả phân tích",
          ) ?? [];
        out.push(...rows.map(fromCandidateRow));
        if (rows.length < PAGE) return out;
      }
    },

    async saveCandidates(jobId, rows, replaceRaw = false) {
      if (rows.length === 0 && !replaceRaw) return;
      check(
        await client.rpc("save_list_candidates", {
          p_job_id: jobId,
          p_rows: rows.map(toCandidateRow) as unknown as Json,
          p_replace_raw: replaceRaw,
        }),
        "Ghi kết quả phân tích",
      );
    },

    findWords(language, lemmas) {
      return selectWords("lemma", lemmas, language);
    },

    getWords(ids) {
      return selectWords("id", ids);
    },

    async enqueueWords(language, items) {
      const data = check(
        await client.rpc("enqueue_admin_words", {
          p_language: language,
          p_items: items as unknown as Json,
        }),
        "Xếp việc tạo nội dung",
      ) as { key: string; job_id: string | null; word_id: string | null; created: boolean }[];
      return data.map((r) => ({
        key: r.key,
        jobId: r.job_id,
        wordId: r.word_id,
        created: r.created,
      }));
    },

    async wordJobs(ids) {
      const out: WordJobStatus[] = [];
      for (const batch of chunks([...new Set(ids)], IN_BATCH)) {
        const rows =
          check(
            await client
              .from("word_jobs")
              .select("id, status, word_id, input_tokens, output_tokens, cost_usd")
              .in("id", batch),
            "Đọc việc tạo nội dung",
          ) ?? [];
        for (const row of rows) {
          out.push({
            id: row.id,
            status: row.status as WordJobStatus["status"],
            wordId: row.word_id,
            usage: {
              inputTokens: row.input_tokens,
              outputTokens: row.output_tokens,
              costUsd: Number(row.cost_usd),
            },
          });
        }
      }
      return out;
    },

    async kickWordWorkers() {
      check(await client.rpc("kick_word_worker_now"), "Gọi worker tạo nội dung");
    },

    async finish(jobId, summary) {
      return (
        check(
          await client.rpc("finish_list_analysis", {
            p_job_id: jobId,
            p_summary: summary as unknown as Json,
          }),
          "Đóng việc phân tích",
        ) ?? 0
      );
    },
  };
}
