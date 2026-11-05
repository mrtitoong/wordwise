import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { englishLemmatizer } from "@/lib/entry/lemmatizer-en";
import { toReading } from "@/lib/lang/zh/lexicon";
import { parsePromptTemplate } from "@/lib/llm/prompt-template";
import { fromWordRows } from "@/lib/schema/word-rows";
import { createLlmRouter } from "@/lib/llm/router";
import type { LLMProvider, ModelSpec, ProviderRequest } from "@/lib/llm/types";
import type { WordRows } from "@/lib/schema/word-rows";
import {
  InvalidWordError,
  LanguageNotEnabledError,
  processJob,
  requestWord,
  type WordJob,
  type WordStore,
  type WorkerDeps,
} from "./pipeline";

const HAIKU: ModelSpec = {
  provider: "claude",
  model: "claude-haiku-5-5",
  freeTier: false,
  maxOutputTokens: 16_000,
  priceUsdPerMTok: { input: 0.1, output: 0.5 },
};

const sense = (meaning: string) => ({
  definition_en: meaning,
  meaning_vi: meaning,
  image_query: "person looking",
  examples: [{ sentence: "我看书。", translation_vi: "Tôi đọc sách.", highlight: "看" }],
  synonyms: [],
  antonyms: [],
  collocations: [],
  idioms: [],
  common_mistakes: [],
});

const draft = (over: { lemma?: string; pos?: string; sense_pinyin?: string[] } = {}) => {
  const lemma = over.lemma ?? "看";
  const sense_pinyin = over.sense_pinyin ?? ["kàn", "kān"];
  return {
    schema_version: 1,
    language: "zh",
    lemma,
    pos: over.pos ?? "verb",
    ipa: { us: null, uk: null },
    cefr: null,
    register: "neutral",
    etymology_vi: null,
    forms: { inflections: [], variants: [] },
    senses: sense_pinyin.map((p) => sense(p)),
    homonyms: [],
    word_family: [],
    mnemonics: [],
    confusables: [],
    confidence: { collocations: 1, idioms: 1, mnemonics: 1 },
    language_extra: {
      kind: "zh",
      simplified: lemma,
      traditional: lemma,
      pinyin: "sai",
      tones: [1],
      hsk: null,
      sense_pinyin,
    },
  };
};

function setup(response: unknown, readings: { pinyin: string; common: boolean }[]) {
  const saved: WordRows[] = [];
  const calls: ProviderRequest[] = [];
  const store = {
    findWordId: vi.fn(async () => null),
    zhReadings: vi.fn(async () =>
      readings.map((r) => toReading({ traditional: "看", pinyin: r.pinyin, common: r.common })),
    ),
    zhLexicon: vi.fn(async () => new Map()),
    zhHanViet: vi.fn(async () => new Map()),
    zhSimplified: vi.fn(async (text: string) => text),
    saveWord: vi.fn(async (_job: string, rows: WordRows) => {
      saved.push(rows);
      return rows.word.id;
    }),
    failJob: vi.fn(async () => {}),
  } as unknown as WordStore;
  const provider: LLMProvider = {
    id: "claude",
    async generate(request) {
      calls.push(request);
      return { text: JSON.stringify(response), usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const llm = createLlmRouter({
    config: {
      "word-content": { containsUserData: false, models: [HAIKU], schemaMode: "prompt" },
      "word-content-zh": { containsUserData: false, models: [HAIKU], schemaMode: "prompt" },
    },
    providers: { claude: provider },
    sleep: async () => {},
  });
  let n = 0;
  const deps: WorkerDeps = {
    store,
    llm,
    template: parsePromptTemplate(readFileSync("src/prompts/word-content.md", "utf8")),
    zhTemplate: parsePromptTemplate(readFileSync("src/prompts/word-content-zh.md", "utf8")),
    fetchDictionary: vi.fn(async () => null),
    newId: () => `id-${++n}`,
    now: () => 1_000_000,
  };
  return { deps, saved, calls };
}

const job = (over: Partial<WordJob> = {}): WordJob => ({
  id: "job-1",
  language: "zh",
  lemma: "看",
  pos: "verb",
  source: "bulk",
  attempts: 1,
  frequencyRank: null,
  ...over,
});

const KAN = [
  { pinyin: "kan4", common: true },
  { pinyin: "kan1", common: true },
];

describe("tạo thẻ từ tiếng Trung", () => {
  it("chỉ gửi âm đọc cho AI, không gọi từ điển tiếng Anh; lưu âm từ từ điển", async () => {
    const { deps, saved, calls } = setup(draft(), KAN);
    const outcome = await processJob(job(), deps);
    expect(outcome).toMatchObject({ status: "done", created: true });
    expect(deps.fetchDictionary).not.toHaveBeenCalled();
    expect(calls[0]!.prompt).toContain("kàn | kān");
    const row = saved[0]!.word;
    expect(row.generated_by).toBe("claude/claude-haiku-5-5 word-content-zh@v3");
    expect(row.cefr).toBeNull();
    expect(row.details.language_extra).toMatchObject({
      pinyin: "kàn",
      tones: [4],
      sense_pinyin: ["kàn", "kān"],
      reading_source: "dictionary",
    });
  });

  it("điền âm Hán Việt, pinyin câu ví dụ; đọc lại được từ các dòng đã lưu", async () => {
    const { deps, saved, calls } = setup(draft(), KAN);
    deps.store.zhHanViet = vi.fn(async () => new Map([["看", ["khán", "khan"]]]));
    await processJob(job(), deps);
    expect(calls[0]!.prompt).toContain("看: khán, khan");
    const { word, senses, details } = saved[0]!;
    expect(word.details.language_extra).toMatchObject({
      han_viet: ["khán"],
      example_pinyin: [["wǒ kàn shū."], ["wǒ kān shū."]],
    });
    const content = fromWordRows({ word, senses, details });
    expect(content.language).toBe("zh");
    expect(content.language_extra).toMatchObject({ han_viet: ["khán"] });
  });

  it("lượng từ lưu được; âm AI viết ngoài từ điển thì đánh dấu cần duyệt", async () => {
    const lemma = "个";
    const content = draft({ lemma, pos: "classifier", sense_pinyin: ["gě"] });
    content.senses[0]!.examples[0] = {
      sentence: "三个人。",
      translation_vi: "Ba người.",
      highlight: lemma,
    };
    const readings = [
      { pinyin: "ge4", common: true },
      { pinyin: "ge3", common: false },
      { pinyin: "ge5", common: true },
    ];
    const { deps, saved } = setup(content, readings);
    const outcome = await processJob(job({ lemma, pos: "classifier" }), deps);
    expect(outcome).toMatchObject({ status: "done" });
    expect(saved[0]!.word.pos).toBe("classifier");
    expect(saved[0]!.word.details.language_extra).toMatchObject({ reading_source: "ai" });
  });

  it("sai từ hoặc sai loại từ thì không lưu, xếp lại việc", async () => {
    const { deps, saved } = setup(draft({ pos: "noun" }), KAN);
    const outcome = await processJob(job(), deps);
    expect(outcome.status).toBe("retry");
    expect(saved).toEqual([]);
  });
});

describe("cờ tiếng Trung", () => {
  const request = { action: "request" as const, lemma: "看", language: "zh" as const };
  const pipeline = (allowed: boolean) => ({
    lemmatizer: englishLemmatizer,
    store: {
      canUseFlaggedLanguage: vi.fn(async () => allowed),
      findWords: vi.fn(async () => []),
      zhSimplified: vi.fn(async (text: string) => text),
      requestJob: vi.fn(async () => ({
        limitReached: false as const,
        jobId: "job-1",
        dailyLimit: 50,
      })),
    } as unknown as WordStore,
  });

  it("chữ phồn thể đổi về giản thể trước khi tìm và xếp việc", async () => {
    const on = pipeline(true);
    on.store.zhSimplified = vi.fn(async () => "学校");
    const response = await requestWord({ ...request, lemma: "學校" }, "user", on);
    expect(response).toMatchObject({ status: "preparing", lemma: "学校" });
    expect(on.store.findWords).toHaveBeenCalledWith("zh", "学校", null);
    expect(on.store.requestJob).toHaveBeenCalledWith("user", "zh", "学校", null);
  });

  it("không có chữ Hán thì không xếp việc, không tốn tiền", async () => {
    const on = pipeline(true);
    await expect(requestWord({ ...request, lemma: "xuexiao" }, "user", on)).rejects.toBeInstanceOf(
      InvalidWordError,
    );
    expect(on.store.requestJob).not.toHaveBeenCalled();
  });

  it("chưa bật cờ hoặc là khách thì không tạo từ", async () => {
    const off = pipeline(false);
    await expect(requestWord(request, "user", off)).rejects.toBeInstanceOf(LanguageNotEnabledError);
    expect(off.store.requestJob).not.toHaveBeenCalled();
    await expect(requestWord(request, null, pipeline(true))).rejects.toBeInstanceOf(
      LanguageNotEnabledError,
    );
  });

  it("đã bật cờ thì xếp việc, giữ nguyên chữ Hán", async () => {
    const on = pipeline(true);
    const response = await requestWord(request, "user", on);
    expect(response).toMatchObject({ status: "preparing", lemma: "看" });
  });

  it("tiếng Anh không hỏi cờ", async () => {
    const on = pipeline(false);
    await requestWord({ ...request, lemma: "run", language: "en" }, "user", on);
    expect(on.store.canUseFlaggedLanguage).not.toHaveBeenCalled();
  });
});
