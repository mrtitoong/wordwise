import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MAX_JOB_ATTEMPTS, WORKER_MIN_REMAINING_MS } from "@/config/words";
import type { DictionaryData } from "@/lib/dictionary/free-dictionary";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { LlmExhaustedError, LlmProviderError } from "@/lib/llm/errors";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { createLlmRouter } from "@/lib/llm/router";
import type { LLMProvider, ModelSpec, ProviderRequest } from "@/lib/llm/types";
import { loadExampleWords } from "@/lib/schema/examples";
import type { Language, Pos, WordContent } from "@/lib/schema/word";
import { fromWordRows, type WordRows } from "@/lib/schema/word-rows";
import type { StoredWord } from "./api";
import {
  processJob,
  requestWord,
  retryDelayMs,
  runWorker,
  stripIpaSlashes,
  type RequestJobResult,
  type WordJob,
  type WordStore,
  type WorkerDeps,
} from "./pipeline";

const examples = loadExampleWords();
const example = (lemma: string) => examples.find((w) => w.lemma === lemma)!;
const template = parsePromptTemplate(readFileSync("src/prompts/word-content.md", "utf8"));

/* ---------- Kho giả trong bộ nhớ (cùng quy tắc với các hàm SQL) ---------- */

type FakeJob = WordJob & {
  status: "queued" | "running" | "done" | "failed";
  error?: string;
  retryAt?: Date | null;
};

function fakeStore(initial: WordContent[] = [], dailyLimit = 50) {
  const words = new Map<string, { id: string; rows: WordRows }>();
  const jobs: FakeJob[] = [];
  const requests = new Map<string, Set<string>>();
  let nextId = 1;
  const key = (language: string, lemma: string, pos: string) => `${language}|${lemma}|${pos}`;

  const addWord = (rows: WordRows) => {
    const k = key(rows.word.language, rows.word.lemma, rows.word.pos);
    const existing = words.get(k);
    if (existing) return existing.id;
    words.set(k, { id: rows.word.id, rows });
    return rows.word.id;
  };
  for (const content of initial) {
    const id = `seed-${nextId++}`;
    addWord({
      word: { ...toRowsStub(content, id) },
      senses: content.senses.map((sense, index) => ({
        id: `${id}-s${index}`,
        word_id: id,
        sense_order: index,
        definition_en: sense.definition_en,
        meaning_vi: sense.meaning_vi,
        image_query: sense.image_query,
      })),
      details: content.senses.map((sense, index) => ({
        sense_id: `${id}-s${index}`,
        examples: sense.examples,
        synonyms: sense.synonyms,
        antonyms: sense.antonyms,
        collocations: sense.collocations,
        idioms: sense.idioms,
        common_mistakes: sense.common_mistakes,
      })),
    });
  }

  const toStored = ({ id, rows }: { id: string; rows: WordRows }): StoredWord => ({
    id,
    senseIds: rows.senses.map((s) => s.id),
    content: fromWordRows(rows),
    media: { audio: { us: null, uk: null }, images: rows.senses.map(() => null) },
  });

  const store: WordStore = {
    async findWords(language: Language, lemma: string, pos: Pos | null) {
      return [...words.values()]
        .filter((w) => w.rows.word.language === language && w.rows.word.lemma === lemma)
        .filter((w) => pos === null || w.rows.word.pos === pos)
        .map(toStored);
    },
    async findWordId(language, lemma, pos) {
      return words.get(key(language, lemma, pos))?.id ?? null;
    },
    async requestJob(userId, language, lemma, pos): Promise<RequestJobResult> {
      let job = jobs.find(
        (j) =>
          j.language === language &&
          j.lemma === lemma &&
          j.pos === pos &&
          (j.status === "queued" || j.status === "running"),
      );
      if (job && requests.get(job.id)?.has(userId)) {
        return { limitReached: false, jobId: job.id, dailyLimit };
      }
      const used = [...requests.values()].filter((users) => users.has(userId)).length;
      if (used >= dailyLimit) return { limitReached: true, dailyLimit };
      if (!job) {
        job = {
          id: `job-${nextId++}`,
          language,
          lemma,
          pos,
          source: "user",
          attempts: 0,
          frequencyRank: null,
          status: "queued",
        };
        jobs.push(job);
      }
      const users = requests.get(job.id) ?? new Set<string>();
      users.add(userId);
      requests.set(job.id, users);
      return { limitReached: false, jobId: job.id, dailyLimit };
    },
    async claimJobs(limit, jobId) {
      const due = jobs.filter((j) => j.status === "queued" && (!jobId || j.id === jobId));
      return due.slice(0, limit).map((j) => {
        j.status = "running";
        j.attempts++;
        return { ...j };
      });
    },
    async saveWord(jobId, rows) {
      const id = addWord(rows);
      await store.completeJob(jobId, id);
      return id;
    },
    async completeJob(jobId) {
      jobs.find((j) => j.id === jobId)!.status = "done";
    },
    async failJob(jobId, error, retryAt) {
      const job = jobs.find((j) => j.id === jobId)!;
      job.status = retryAt ? "queued" : "failed";
      job.error = error;
      job.retryAt = retryAt;
    },
  };
  return { store, jobs, words, requests };
}

function toRowsStub(content: WordContent, id: string): WordRows["word"] {
  return {
    id,
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
      language_extra: content.language_extra,
    },
    schema_version: content.schema_version,
    generated_by: null,
    reviewed: true,
  };
}

/* ---------- LLM giả (đi qua router thật: Zod, gọi lại, dự phòng) ---------- */

const HAIKU: ModelSpec = {
  provider: "claude",
  model: "claude-haiku-5-5",
  freeTier: false,
  maxOutputTokens: 16_000,
  priceUsdPerMTok: { input: 0.1, output: 0.5 },
};

function fakeLlm(script: Array<unknown | Error>) {
  const calls: ProviderRequest[] = [];
  const provider: LLMProvider = {
    id: "claude",
    async generate(request) {
      calls.push(request);
      const next = script.shift();
      if (next === undefined) throw new Error("hết kịch bản");
      if (next instanceof Error) throw next;
      return {
        text: typeof next === "string" ? next : JSON.stringify(next),
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
  const llm = createLlmRouter({
    config: { "word-content": { containsUserData: false, models: [HAIKU], schemaMode: "prompt" } },
    providers: { claude: provider },
    sleep: async () => {},
  });
  return { llm, calls };
}

function workerDeps(
  store: WordStore,
  script: Array<unknown | Error>,
  dictionary: DictionaryData | null = null,
) {
  const { llm, calls } = fakeLlm(script);
  let n = 0;
  const deps: WorkerDeps = {
    store,
    llm,
    template,
    fetchDictionary: vi.fn(async () => dictionary),
    newId: () => `id-${++n}`,
    now: () => 1_000_000,
  };
  return { deps, calls };
}

const USER = "user-1";

/* ---------- requestWord ---------- */

describe("requestWord", () => {
  const pipeline = (store: WordStore) => ({ store, lemmatizer: englishLemmatizer });

  it("từ đã có trong kho → trả ngay, đưa về dạng gốc trước khi tìm", async () => {
    const { store, jobs } = fakeStore([example("run")]);
    const response = await requestWord(
      { action: "request", lemma: " Running ", language: "en" },
      USER,
      pipeline(store),
    );
    expect(response.status).toBe("ready");
    if (response.status !== "ready") return;
    expect(response.lemma).toBe("run");
    expect(response.words[0]!.content.lemma).toBe("run");
    expect(response.words[0]!.senseIds).toHaveLength(response.words[0]!.content.senses.length);
    expect(jobs).toHaveLength(0);
  });

  it("dạng gõ đã có sẵn như từ riêng → dùng luôn", async () => {
    const building = { ...example("deadline"), lemma: "meetings" };
    const { store } = fakeStore([building]);
    const response = await requestWord(
      { action: "request", lemma: "meetings", language: "en" },
      USER,
      pipeline(store),
    );
    expect(response).toMatchObject({ status: "ready", lemma: "meetings" });
    if (response.status === "ready") expect(response.alternatives).toContain("meeting");
  });

  it("từ ngoài kho, khách → mời đăng nhập, không xếp việc", async () => {
    const { store, jobs } = fakeStore();
    const response = await requestWord(
      { action: "request", lemma: "zygote", language: "en" },
      null,
      pipeline(store),
    );
    expect(response.status).toBe("login_required");
    expect(jobs).toHaveLength(0);
  });

  it("từ ngoài kho, đã đăng nhập → xếp việc; hai người cùng từ → một việc", async () => {
    const { store, jobs } = fakeStore();
    const a = await requestWord(
      { action: "request", lemma: "zygotes", language: "en" },
      USER,
      pipeline(store),
    );
    const b = await requestWord(
      { action: "request", lemma: "zygote", language: "en" },
      "user-2",
      pipeline(store),
    );
    expect(a).toMatchObject({ status: "preparing", lemma: "zygote" });
    expect(b.status === "preparing" && a.status === "preparing" && b.jobId === a.jobId).toBe(true);
    expect(jobs).toHaveLength(1);
  });

  it("hết lượt từ mới trong ngày → limit_reached", async () => {
    const { store } = fakeStore([], 1);
    await requestWord(
      { action: "request", lemma: "zygote", language: "en" },
      USER,
      pipeline(store),
    );
    const response = await requestWord(
      { action: "request", lemma: "quokka", language: "en" },
      USER,
      pipeline(store),
    );
    expect(response).toMatchObject({ status: "limit_reached", dailyLimit: 1 });
  });
});

/* ---------- processJob ---------- */

const job = (overrides: Partial<WordJob> = {}): WordJob => ({
  id: "job-x",
  language: "en",
  lemma: "resilient",
  pos: "adjective",
  source: "user",
  attempts: 1,
  frequencyRank: null,
  ...overrides,
});

async function queued(store: WordStore, lemma: string, pos: Pos | null) {
  const result = await store.requestJob(USER, "en", lemma, pos);
  if (result.limitReached) throw new Error("limit");
  const [claimed] = await store.claimJobs(1, result.jobId);
  return claimed!;
}

describe("processJob", () => {
  it("tạo nội dung, lưu kho với generated_by và reviewed = false", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const { deps } = workerDeps(fake.store, [example("resilient")]);
    const outcome = await processJob(claimed, deps);
    expect(outcome).toMatchObject({ status: "done", created: true });
    const saved = [...fake.words.values()][0]!.rows;
    expect(saved.word.generated_by).toBe("claude/claude-haiku-5-5 word-content@v3");
    expect(saved.word.reviewed).toBe(false);
    expect(saved.senses).toHaveLength(example("resilient").senses.length);
    expect(fake.jobs[0]!.status).toBe("done");
  });

  it("không đưa câu ngữ cảnh của người dùng vào prompt, có dữ liệu từ điển", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const dictionary: DictionaryData = {
      meanings: [{ pos: "adjective", definitions: ["Able to recover quickly."] }],
    };
    const { deps, calls } = workerDeps(fake.store, [example("resilient")], dictionary);
    await processJob(claimed, deps);
    expect(calls[0]!.prompt).toContain("Able to recover quickly.");
    expect(calls[0]!.prompt).not.toContain("context");
    expect(calls[0]!.prompt).toContain("B1");
  });

  it("sai schema thì gọi lại; dấu '/' quanh IPA được tự bỏ", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const withSlashes = {
      ...example("resilient"),
      ipa: { us: "/rɪˈzɪl.jənt/", uk: "/rɪˈzɪl.i.ənt/" },
    };
    const { deps, calls } = workerDeps(fake.store, ["không phải JSON", withSlashes]);
    const outcome = await processJob(claimed, deps);
    expect(outcome.status).toBe("done");
    expect(calls).toHaveLength(2);
    expect([...fake.words.values()][0]!.rows.word.ipa_us).toBe("rɪˈzɪl.jənt");
  });

  it("model trả sai từ → coi như sai schema", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const wrong = example("tenacious");
    const { deps, calls } = workerDeps(fake.store, [wrong, wrong, wrong]);
    const outcome = await processJob(claimed, deps);
    expect(outcome.status).toBe("retry");
    expect(calls).toHaveLength(3); // lần đầu + gọi lại 2 lần
    expect(fake.words.size).toBe(0);
  });

  it("giữ IPA do model viết, không lấy IPA từ điển", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const { deps, calls } = workerDeps(fake.store, [example("resilient")], {
      meanings: [{ pos: "adjective", definitions: ["Able to recover quickly."] }],
    });
    await processJob(claimed, deps);
    const saved = [...fake.words.values()][0]!.rows.word;
    expect(saved.ipa_us).toBe(example("resilient").ipa.us);
    expect(saved.ipa_uk).toBe(example("resilient").ipa.uk);
    // Từ điển chỉ gửi nghĩa tham khảo, không gửi IPA.
    expect(calls[0]!.prompt).toContain(
      '{"meanings":[{"pos":"adjective","definitions":["Able to recover quickly."]}]}',
    );
  });

  it("không rõ loại từ → model chọn loại phổ biến nhất, không theo thứ tự từ điển", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", null);
    // Từ điển liệt kê danh từ trước (như "and" trong Wiktionary) – không được dùng làm loại từ.
    const { deps, calls } = workerDeps(fake.store, [example("resilient")], {
      meanings: [
        { pos: "noun", definitions: ["A rare sense."] },
        { pos: "adjective", definitions: ["Able to recover quickly."] },
      ],
    });
    const outcome = await processJob(claimed, deps);
    expect(calls[0]!.prompt).toContain("loại từ: chưa chỉ định");
    expect(calls[0]!.prompt).toContain("chọn MỘT loại từ phổ biến nhất");
    // Model vẫn thấy mọi loại từ trong dữ liệu từ điển để tham khảo.
    expect(calls[0]!.prompt).toContain("A rare sense.");
    expect(outcome).toMatchObject({ status: "done", created: true });
    expect([...fake.words.values()][0]!.rows.word.pos).toBe("adjective");
  });

  it("loại từ model chọn đã có trong kho → đóng việc, giữ bản cũ", async () => {
    const fake = fakeStore([example("resilient")]);
    const claimed = await queued(fake.store, "resilient", null);
    const { deps } = workerDeps(fake.store, [example("resilient")]);
    const outcome = await processJob(claimed, deps);
    expect(outcome).toMatchObject({ status: "done", created: false });
    expect(fake.words.size).toBe(1);
  });

  it("bị giới hạn lượt gọi → xếp lại để thử sau, không báo lỗi cho người dùng", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const limited = () => new LlmProviderError("429", "claude", true, true, 429);
    const { deps } = workerDeps(fake.store, Array.from({ length: 6 }, limited));
    const outcome = await processJob(claimed, deps);
    expect(outcome.status).toBe("retry");
    if (outcome.status === "retry") {
      expect(outcome.retryAt.getTime()).toBe(1_000_000 + retryDelayMs(1));
    }
    expect(fake.jobs[0]!.status).toBe("queued");
  });

  it(`quá ${MAX_JOB_ATTEMPTS} lần → thất bại hẳn`, async () => {
    const fake = fakeStore();
    await queued(fake.store, "resilient", "adjective");
    const { deps } = workerDeps(fake.store, [new LlmExhaustedError("word-content", "x")]);
    const outcome = await processJob(
      job({ id: fake.jobs[0]!.id, attempts: MAX_JOB_ATTEMPTS }),
      deps,
    );
    expect(outcome.status).toBe("failed");
    expect(fake.jobs[0]!.status).toBe("failed");
  });

  it("ghi frequency_rank của danh sách tạo trước", async () => {
    const fake = fakeStore();
    const claimed = await queued(fake.store, "resilient", "adjective");
    const { deps } = workerDeps(fake.store, [example("resilient")]);
    await processJob({ ...claimed, frequencyRank: 1234 }, deps);
    expect([...fake.words.values()][0]!.rows.word.frequency_rank).toBe(1234);
  });
});

describe("runWorker", () => {
  it("xử lý việc được chỉ định rồi dừng khi hết việc", async () => {
    const fake = fakeStore();
    const a = await fake.store.requestJob(USER, "en", "resilient", "adjective");
    await fake.store.requestJob(USER, "en", "tenacious", "adjective");
    const { deps } = workerDeps(fake.store, [example("resilient"), example("tenacious")]);
    const outcomes = await runWorker(deps, { jobId: a.limitReached ? "" : a.jobId });
    expect(outcomes.map((o) => o.status)).toEqual(["done", "done"]);
  });

  it("không nhận việc mới khi không đủ thời gian", async () => {
    const fake = fakeStore();
    await fake.store.requestJob(USER, "en", "resilient", "adjective");
    const { deps } = workerDeps(fake.store, [example("resilient")]);
    const outcomes = await runWorker(deps, { budgetMs: WORKER_MIN_REMAINING_MS - 1 });
    expect(outcomes).toHaveLength(0);
  });

  it("việc chỉ định đã bị worker khác nhận → làm việc khác, không lặp vô hạn", async () => {
    const fake = fakeStore();
    const { deps } = workerDeps(fake.store, []);
    expect(await runWorker(deps, { jobId: "không-có" })).toEqual([]);
  });
});

describe("stripIpaSlashes", () => {
  it("chỉ sửa ipa.us / ipa.uk", () => {
    expect(stripIpaSlashes({ ipa: { us: "/rʌn/", uk: null }, lemma: "/x/" })).toEqual({
      ipa: { us: "rʌn", uk: null },
      lemma: "/x/",
    });
    expect(stripIpaSlashes("x")).toBe("x");
  });
});
