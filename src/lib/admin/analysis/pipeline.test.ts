import { describe, expect, it } from "vitest";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import type { ModelSpec } from "@/lib/llm/types";
import type { ExtractedItems, SensePicks, Subtopics, Triage } from "@/lib/llm/tasks/list-analysis";
import listAnalyzerPrompt from "@/prompts/list-analyzer.md?raw";
import listSubtopicsPrompt from "@/prompts/list-subtopics.md?raw";
import listTriagePrompt from "@/prompts/list-triage.md?raw";
import sensePickerPrompt from "@/prompts/sense-picker.md?raw";
import type { Pos } from "@/lib/schema/word";
import {
  runListWorker,
  type AnalysisDeps,
  type AnalysisLlm,
  type AnalysisStore,
  type AnalysisTask,
  type JobPatch,
  type WordJobStatus,
} from "./pipeline";
import type { AnalysisJob, AnalysisSummary, Candidate, LibraryWord, SourceRecord } from "./types";

/* ---------- Database giả (cùng quy tắc với các hàm SQL) ---------- */

type JobRow = AnalysisJob & {
  status: "queued" | "running" | "succeeded" | "failed";
  lockedUntil: number | null;
  runAfter: number;
  cost: { inputTokens: number; outputTokens: number; costUsd: number };
  errors: string[];
};

function libWord(
  lemma: string,
  pos: Pos,
  patch: Partial<LibraryWord> & { meanings?: string[] } = {},
): LibraryWord {
  const meanings = patch.meanings ?? [`nghĩa ${lemma}`];
  return {
    id: `w-${lemma}-${pos}`,
    lemma,
    pos,
    cefr: "B1",
    frequencyRank: null,
    senses: meanings.map((m, i) => ({
      id: `s-${lemma}-${pos}-${i + 1}`,
      definitionEn: `${lemma} ${i + 1}`,
      meaningVi: m,
    })),
    family: [],
    confusables: [],
    confidence: 0.9,
    ...patch,
  };
}

function fakeStore(options: {
  clock: { now: number };
  sources: SourceRecord[];
  library: LibraryWord[];
  /** Từ mà worker generate-word tạo lỗi. */
  failingWords?: string[];
  minCefr?: AnalysisJob["options"]["min_cefr"];
}) {
  const { clock } = options;
  const library = [...options.library];
  const candidates = new Map<string, Candidate>();
  const wordJobs = new Map<
    string,
    {
      lemma: string;
      pos: Pos | null;
      status: WordJobStatus["status"];
      wordId: string | null;
      kicks: number;
    }
  >();
  const items: { senseId: string; itemOrder: number; warnings: unknown[] }[] = [];
  let summary: AnalysisSummary | null = null;
  const job: JobRow = {
    id: "job-1",
    listId: "list-1",
    step: "extract",
    done: 0,
    total: 0,
    options: options.minCefr ? { min_cefr: options.minCefr } : {},
    state: {},
    attempts: 0,
    list: { language: "en", targetCefr: "B2", title: "IELTS", topic: "Học thuật", purpose: null },
    status: "queued",
    lockedUntil: null,
    runAfter: 0,
    cost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    errors: [],
  };
  let kicks = 0;

  const store: AnalysisStore = {
    async claimJob() {
      if (job.status !== "queued" && job.status !== "running") return null;
      if (job.runAfter > clock.now) return null;
      if (job.lockedUntil !== null && job.lockedUntil > clock.now) return null;
      job.status = "running";
      job.lockedUntil = clock.now + 180_000;
      return structuredClone({
        id: job.id,
        listId: job.listId,
        step: job.step,
        done: job.done,
        total: job.total,
        options: job.options,
        state: job.state,
        attempts: job.attempts,
        list: job.list,
      });
    },
    async saveJob(id, patch: JobPatch) {
      if (patch.step !== job.step) job.attempts = 0;
      Object.assign(job, {
        step: patch.step,
        done: patch.done,
        total: patch.total,
        state: structuredClone(patch.state),
      });
      if (patch.usage) {
        job.cost.inputTokens += patch.usage.inputTokens;
        job.cost.outputTokens += patch.usage.outputTokens;
        job.cost.costUsd += patch.usage.costUsd;
      }
      job.runAfter = clock.now + (patch.waitSeconds ?? 0) * 1000;
      job.lockedUntil = patch.keepLock ? clock.now + 180_000 : null;
    },
    async failJob(id, error) {
      job.attempts += 1;
      job.errors.push(error);
      job.lockedUntil = null;
      job.runAfter = clock.now + 60_000;
      if (job.attempts >= 3) {
        job.status = "failed";
        return "failed";
      }
      return "retry";
    },
    async loadSources() {
      return structuredClone(options.sources);
    },
    async loadCandidates() {
      return structuredClone([...candidates.values()].sort((a, b) => a.position - b.position));
    },
    async saveCandidates(id, rows, replaceRaw) {
      if (replaceRaw)
        for (const [key, c] of candidates) if (c.stage === "raw") candidates.delete(key);
      for (const row of rows) candidates.set(row.id, structuredClone(row));
    },
    async findWords(language, lemmas) {
      return library.filter((w) => lemmas.includes(w.lemma));
    },
    async getWords(ids) {
      return library.filter((w) => ids.includes(w.id));
    },
    async enqueueWords(language, list) {
      return list.map(({ key, lemma, pos }) => {
        const existing = library.find((w) => w.lemma === lemma && (pos === null || w.pos === pos));
        if (existing) return { key, jobId: null, wordId: existing.id, created: false };
        const id = `job-${lemma}`;
        wordJobs.set(id, { lemma, pos, status: "queued", wordId: null, kicks: 0 });
        return { key, jobId: id, wordId: null, created: true };
      });
    },
    async wordJobs(ids) {
      return ids.flatMap((id) => {
        const j = wordJobs.get(id);
        return j
          ? [
              {
                id,
                status: j.status,
                wordId: j.wordId,
                usage: { inputTokens: 1000, outputTokens: 4000, costUsd: 0.0021 },
              },
            ]
          : [];
      });
    },
    async kickWordWorkers() {
      kicks++;
      // Worker generate-word giả: mỗi việc xong sau lần gọi thứ hai.
      for (const [id, j] of wordJobs) {
        if (j.status !== "queued") continue;
        if (++j.kicks < 2) continue;
        if (options.failingWords?.includes(j.lemma)) {
          j.status = "failed";
          continue;
        }
        const created = libWord(j.lemma, j.pos ?? "noun", {
          cefr: j.lemma === "zygote" ? "C2" : "C1",
        });
        library.push(created);
        Object.assign(j, { status: "done", wordId: created.id });
        wordJobs.set(id, j);
      }
    },
    async finish(id, s) {
      summary = s;
      const seen = new Set<string>();
      const kept = [...candidates.values()]
        .filter((c) => c.dropped === null && c.senseId)
        .sort((a, b) => (a.itemOrder ?? 0) - (b.itemOrder ?? 0) || a.position - b.position);
      for (const c of kept) {
        if (seen.has(c.senseId!)) continue;
        seen.add(c.senseId!);
        items.push({ senseId: c.senseId!, itemOrder: items.length, warnings: c.warnings });
      }
      Object.assign(job, { status: "succeeded", step: "warn", lockedUntil: null });
      return items.length;
    },
  };
  return {
    store,
    job,
    candidates,
    items,
    wordJobs,
    library,
    get summary() {
      return summary;
    },
    get kicks() {
      return kicks;
    },
  };
}

/* ---------- LLM giả: trả lời theo tác vụ, mỗi lượt tốn 5 giây ---------- */

const MODEL: ModelSpec = {
  provider: "claude",
  model: "claude-haiku-5-5",
  freeTier: false,
  maxOutputTokens: 16_000,
  priceUsdPerMTok: { input: 1, output: 1 },
};

type Answers = {
  "list-analyzer": (prompt: string) => ExtractedItems;
  "list-triage": (items: { key: string; word: string }[]) => Triage;
  "sense-picker": (items: { key: string; word: string }[]) => SensePicks;
  "list-subtopics": (items: { i: number; w: string }[]) => Subtopics;
};

function fakeLlm(clock: { now: number }, answers: Answers, failOnce: AnalysisTask[] = []) {
  const calls: AnalysisTask[] = [];
  const pendingFailures = new Set(failOnce);
  const llm: AnalysisLlm = {
    async generateJSON(task, { prompt, schema }) {
      calls.push(task);
      clock.now += 5_000;
      if (pendingFailures.delete(task)) throw new Error(`${task} quá tải`);
      const json = (tag: string) =>
        JSON.parse(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(prompt)![1]!);
      const data =
        task === "list-analyzer"
          ? answers[task](prompt)
          : task === "list-triage"
            ? answers[task](json("words"))
            : task === "sense-picker"
              ? answers[task](json("items"))
              : answers[task](json("words"));
      return {
        data: schema.parse(data),
        model: MODEL,
        usage: { inputTokens: 100, outputTokens: 50 },
        isFallback: false,
      };
    },
  };
  return { llm, calls };
}

function deps(store: AnalysisStore, llm: AnalysisLlm, clock: { now: number }): AnalysisDeps {
  let n = 0;
  return {
    store,
    llm,
    templates: {
      "list-analyzer": parsePromptTemplate(listAnalyzerPrompt),
      "list-triage": parsePromptTemplate(listTriagePrompt),
      "sense-picker": parsePromptTemplate(sensePickerPrompt),
      "list-subtopics": parsePromptTemplate(listSubtopicsPrompt),
    },
    lemmatizer: englishLemmatizer,
    newId: () => `cand-${++n}`,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
  };
}

/** Như pg_cron: gọi worker mỗi phút cho tới khi xong (tối đa `max` lượt). */
async function runUntilDone(d: AnalysisDeps, job: JobRow, clock: { now: number }, max = 30) {
  let runs = 0;
  while ((job.status === "queued" || job.status === "running") && runs < max) {
    await runListWorker(d);
    runs++;
    clock.now += 60_000;
  }
  return runs;
}

const LIBRARY = [
  libWord("bank", "noun", { frequencyRank: 900, meanings: ["ngân hàng", "bờ sông"] }),
  libWord("cat", "noun", { frequencyRank: 50, cefr: "A1" }),
  libWord("record", "noun", { frequencyRank: 800, meanings: ["hồ sơ", "kỷ lục"] }),
  libWord("record", "verb", { frequencyRank: 1200, meanings: ["ghi lại"] }),
  libWord("receive", "verb", { frequencyRank: 400 }),
];

const ANSWERS: Answers = {
  "list-analyzer": () => ({
    items: [
      { text: "mitigate", pos: "verb", sentence: "Companies must mitigate risks.", cefr: "C1" },
      { text: "bank", pos: "noun", sentence: "The bank raised rates.", cefr: "B1" },
    ],
  }),
  "list-triage": (items) => ({
    items: items.map(({ key, word }) =>
      word === "recieve"
        ? { key, valid: false, correction: "receive", cefr: "B1", rare: false }
        : word === "qwzx"
          ? { key, valid: false, correction: null, cefr: null, rare: false }
          : {
              key,
              valid: true,
              correction: null,
              cefr: word === "zygote" ? "C2" : "C1",
              rare: word === "zygote",
            },
    ),
  }),
  "sense-picker": (items) => ({
    picks: items.map(({ key, word }) => ({ key, n: word === "record" ? 3 : 1, confidence: 0.9 })),
  }),
  "list-subtopics": (items) => ({
    topics: ["A", "B"],
    items: items.map(({ i }) => ({ i, t: i % 2 })),
  }),
};

const SOURCES: SourceRecord[] = [
  {
    id: "src-1",
    kind: "rows",
    rows: [
      { word: "bank", meaning: "bờ sông", example: null, note: "N1", tags: [] },
      { word: "Banks", meaning: null, example: null, note: null, tags: [] },
      { word: "recieve", meaning: null, example: null, note: null, tags: [] },
      { word: "qwzx", meaning: null, example: null, note: null, tags: [] },
      { word: "zygote", meaning: null, example: null, note: null, tags: [] },
      { word: "cat", meaning: null, example: null, note: null, tags: [] },
      {
        word: "record",
        meaning: null,
        example: "Please record the meeting.",
        note: null,
        tags: [],
      },
      { word: "badword", meaning: null, example: null, note: null, tags: [] },
    ],
  },
  { id: "src-2", kind: "document", text: "Companies must mitigate risks. The bank raised rates." },
];

describe("pipeline phân tích danh sách", () => {
  it("chạy đủ 6 bước: gộp, sửa chính tả, lọc, chọn nghĩa, tạo nội dung, sắp xếp, cảnh báo", async () => {
    const clock = { now: Date.parse("2026-10-23T03:00:00Z") };
    const db = fakeStore({
      clock,
      sources: SOURCES,
      library: LIBRARY,
      failingWords: ["badword"],
      minCefr: "A2",
    });
    const { llm, calls } = fakeLlm(clock, ANSWERS);
    const d = deps(db.store, llm, clock);
    const startedAt = clock.now;

    await runUntilDone(d, db.job, clock);
    expect(db.job.status).toBe("succeeded");

    const rows = [...db.candidates.values()];
    const byLemma = (lemma: string) => rows.filter((c) => c.lemma === lemma);
    // bank (bảng, không loại từ) gộp vào bank (bài đọc, danh từ); "Banks" cũng gộp.
    expect(byLemma("bank")).toHaveLength(1);
    expect(byLemma("bank")[0]).toMatchObject({
      pos: "noun",
      occurrences: 3,
      senseId: "s-bank-noun-2",
      senseMethod: "meaning",
      contextSentence: "The bank raised rates.",
      note: "N1",
    });
    expect(byLemma("receive")[0]).toMatchObject({
      spellingFrom: "recieve",
      wordId: "w-receive-verb",
    });
    expect(rows.find((c) => c.surface === "qwzx")!.dropped).toBe("not_a_word");
    expect(byLemma("cat")[0]!.dropped).toBe("below_level");
    expect(byLemma("badword")[0]!.dropped).toBe("content_failed");
    // record không ghi loại từ, câu ngữ cảnh → LLM chọn nghĩa thứ 3 = động từ.
    expect(byLemma("record")[0]).toMatchObject({
      senseId: "s-record-verb-1",
      senseMethod: "context",
      senseConfidence: 0.9,
    });
    expect(byLemma("zygote")[0]).toMatchObject({
      wordId: "w-zygote-noun",
      jobCreated: true,
      senseMethod: "single",
    });
    expect(byLemma("mitigate")[0]).toMatchObject({ wordId: "w-mitigate-verb", jobCreated: true });

    // Mục danh sách: thông dụng trước (theo thứ hạng, rồi CEFR), từ hiếm cuối.
    expect(db.items.map((i) => i.senseId)).toEqual([
      "s-receive-verb-1",
      "s-record-verb-1",
      "s-bank-noun-2",
      "s-mitigate-verb-1",
      "s-zygote-noun-1",
    ]);
    const warningsOf = (senseId: string) =>
      (db.items.find((i) => i.senseId === senseId)!.warnings as { code: string }[]).map(
        (w) => w.code,
      );
    expect(warningsOf("s-receive-verb-1")).toEqual(["spelling"]);
    expect(warningsOf("s-zygote-noun-1")).toEqual(["rare", "above_level"]);
    expect(warningsOf("s-mitigate-verb-1")).toEqual(["above_level"]);

    expect(db.summary).toMatchObject({
      items: 5,
      withWarnings: 3,
      dropped: { not_a_word: 1, below_level: 1, content_failed: 1 },
      newWords: 3,
    });
    expect(db.summary!.durationSeconds).toBeGreaterThan(0);
    expect(db.summary!.durationSeconds).toBeLessThanOrEqual((clock.now - startedAt) / 1000);

    // Danh sách nhỏ (< 15 từ) không chia chủ đề con.
    expect(calls).not.toContain("list-subtopics");
    expect(calls.filter((t) => t === "list-analyzer")).toHaveLength(1);
    // Chi phí: 3 lượt LLM của pipeline (trích, xem trước, chọn nghĩa; 150 token × $1/triệu)
    // + 2 từ mới tạo xong (badword lỗi không tính).
    expect(calls).toEqual(["list-analyzer", "list-triage", "sense-picker"]);
    expect(db.job.cost.inputTokens).toBe(300 + 2 * 1000);
    expect(db.job.cost.outputTokens).toBe(150 + 2 * 4000);
    expect(db.job.cost.costUsd).toBeCloseTo(3 * 150e-6 + 2 * 0.0021, 8);
    expect(db.kicks).toBeGreaterThanOrEqual(2);
  });

  it("lỗi LLM → thử lại sau 1 phút từ đúng bước lỗi, không làm lại bước trước", async () => {
    const clock = { now: 0 };
    const db = fakeStore({ clock, sources: SOURCES, library: LIBRARY });
    const { llm, calls } = fakeLlm(clock, ANSWERS, ["sense-picker"]);
    const d = deps(db.store, llm, clock);

    // Mỗi lượt chạy một bước: chạy tới lượt gặp lỗi.
    let first = await runListWorker(d);
    while (first.runs[0]?.outcome === "continue") first = await runListWorker(d);
    expect(first.runs[0]!.outcome).toBe("retry");
    expect(db.job).toMatchObject({ step: "sense", attempts: 1, status: "running" });
    expect(db.job.errors[0]).toContain("sense-picker quá tải");

    await runUntilDone(d, db.job, clock);
    expect(db.job.status).toBe("succeeded");
    expect(calls.filter((t) => t === "list-analyzer")).toHaveLength(1);
    expect(calls.filter((t) => t === "list-triage")).toHaveLength(1);
    expect(calls.filter((t) => t === "sense-picker")).toHaveLength(2);
  });

  it("lỗi 3 lần liên tiếp → thất bại (Admin chạy lại)", async () => {
    const clock = { now: 0 };
    const db = fakeStore({ clock, sources: SOURCES, library: LIBRARY });
    const llm: AnalysisLlm = {
      async generateJSON() {
        throw new Error("hết lượt");
      },
    };
    await runUntilDone(deps(db.store, llm, clock), db.job, clock);
    expect(db.job.status).toBe("failed");
    expect(db.job.step).toBe("extract");
    expect(db.job.errors).toHaveLength(3);
  });

  it("danh sách dài không có tag: chủ đề con theo LLM, cùng chủ đề đứng liền nhau", async () => {
    const clock = { now: 0 };
    const words = Array.from(
      { length: 260 },
      (_, i) =>
        `term${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    );
    const library = words
      .slice(0, 200)
      .map((w, i) => libWord(w, "noun", { frequencyRank: 1000 + i }));
    const db = fakeStore({
      clock,
      sources: [{ id: "s", kind: "lines", rows: words.map((word) => ({ word, note: null })) }],
      library,
    });
    const { llm, calls } = fakeLlm(clock, ANSWERS);
    const d = deps(db.store, llm, clock);
    await runUntilDone(d, db.job, clock);

    expect(db.job.status).toBe("succeeded");
    expect(db.items).toHaveLength(260);
    // 60 từ mới → 1 lô xem trước; 260 từ → 1 lượt chia chủ đề (≤ 300 từ/lượt).
    expect(calls.filter((t) => t === "list-triage")).toHaveLength(1);
    expect(calls.filter((t) => t === "list-subtopics")).toHaveLength(1);
    const subtopics = new Set([...db.candidates.values()].map((c) => c.subtopic));
    expect(subtopics).toEqual(new Set(["A", "B"]));
    // Cùng chủ đề con đứng liền nhau.
    const order = [...db.candidates.values()]
      .sort((a, b) => a.itemOrder! - b.itemOrder!)
      .map((c) => c.subtopic);
    expect(order.indexOf("B")).toBe(order.lastIndexOf("A") + 1);
  });

  it("chia chủ đề con nhiều lô: lưu tiến độ, lượt sau làm tiếp, không gọi lại lô đã xong", async () => {
    const clock = { now: 0 };
    // 1.300 từ có sẵn trong kho → 5 lô chia chủ đề (300 từ/lô) > 4 lượt LLM mỗi lượt worker.
    const words = Array.from({ length: 1300 }, (_, i) => `term${i.toString(36)}q`);
    const library = words.map((w, i) => libWord(w, "noun", { frequencyRank: 1000 + i }));
    const db = fakeStore({
      clock,
      sources: [{ id: "s", kind: "lines", rows: words.map((word) => ({ word, note: null })) }],
      library,
    });
    const { llm, calls } = fakeLlm(clock, ANSWERS);
    await runUntilDone(deps(db.store, llm, clock), db.job, clock);

    expect(db.job.status).toBe("succeeded");
    expect(calls.filter((t) => t === "list-subtopics")).toHaveLength(5);
    expect([...db.candidates.values()].every((c) => c.subtopic !== null)).toBe(true);
  });

  it("hết giờ giữa chừng → trả việc, báo cần lượt mới", async () => {
    const clock = { now: 0 };
    const db = fakeStore({ clock, sources: SOURCES, library: LIBRARY });
    const { llm } = fakeLlm(clock, ANSWERS);
    const result = await runListWorker(deps(db.store, llm, clock), { budgetMs: 80_000 });
    expect(result.runs[0]!.outcome).toBe("continue");
    expect(result.more).toBe(true);
    expect(db.job.lockedUntil).toBeNull();
    expect(db.job.status).toBe("running");
  });

  it("không có việc → không làm gì", async () => {
    const clock = { now: 0 };
    const db = fakeStore({ clock, sources: SOURCES, library: LIBRARY });
    db.job.status = "succeeded";
    const { llm, calls } = fakeLlm(clock, ANSWERS);
    expect(await runListWorker(deps(db.store, llm, clock))).toEqual({ runs: [], more: false });
    expect(calls).toHaveLength(0);
  });
});
