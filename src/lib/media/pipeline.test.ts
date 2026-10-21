import { describe, expect, it, vi } from "vitest";
import { ImageSearchError, type FoundImage, type ImageProvider } from "./images";
import {
  processMediaWord,
  requestSentenceAudio,
  runMediaWorker,
  type AudioClip,
  type MediaDeps,
  type MediaStore,
  type MediaWord,
} from "./pipeline";
import { TtsError, type TtsProvider } from "./tts-azure";

const SENSE = "11111111-1111-4111-8111-111111111111";

function word(overrides: Partial<MediaWord> = {}): MediaWord {
  return {
    id: "w1",
    language: "en",
    lemma: "apple",
    pos: "noun",
    audioUrl: { us: null, uk: null },
    senses: [{ id: "s1", imageQuery: "red apple" }],
    ...overrides,
  };
}

function fakeStore(words: MediaWord[] = [], options: { remaining?: number } = {}) {
  const clips = new Map<string, AudioClip>();
  const uploads: string[] = [];
  const audio: Record<string, Record<string, string>> = {};
  const images: Record<string, FoundImage | null> = {};
  const released: string[] = [];
  const store: MediaStore = {
    claimWords: vi.fn(async (limit: number) => words.slice(0, limit)),
    uploadAudio: vi.fn(async (path: string) => {
      uploads.push(path);
      return `https://cdn/${path}`;
    }),
    publicUrl: (path) => `https://cdn/${path}`,
    hasClip: async (path) => clips.has(path),
    recordClip: async (clip) => {
      clips.set(clip.path, clip);
    },
    setWordAudio: async (id, voice, url) => {
      audio[id] = { ...audio[id], [voice]: url };
    },
    setSenseImage: async (id, image) => {
      images[id] = image;
    },
    releaseWord: async (id) => {
      released.push(id);
    },
    findExample: async (senseId, index) =>
      senseId === SENSE && index === 0 ? { language: "en", sentence: "I eat an apple." } : null,
    sentenceAudioQuota: async () => ({ remaining: options.remaining ?? 100, dailyLimit: 100 }),
  };
  return { store, clips, uploads, audio, images, released };
}

const okTts = (): TtsProvider & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    synthesize: async (text, voice) => {
      calls.push(`${voice}:${text}`);
      return new Uint8Array([1]);
    },
  };
};

function provider(
  id: "pexels" | "unsplash",
  results: Array<FoundImage | null | Error>,
): ImageProvider & {
  queries: string[];
} {
  const queries: string[] = [];
  return {
    id,
    queries,
    search: async (query) => {
      queries.push(query);
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next ?? null;
    },
  };
}

const image = (url: string): FoundImage => ({
  url,
  credit: { provider: "pexels", author: "A", author_url: "https://a", source_url: "https://s" },
});

const freshState = (imageSearches = 3) => ({ imageSearches, exhausted: new Set<string>() });

describe("processMediaWord", () => {
  it("tạo audio giọng Mỹ và Anh, ghi audio_clips, trả khóa", async () => {
    const fake = fakeStore();
    const tts = okTts();
    const deps: MediaDeps = { store: fake.store, tts, images: [] };
    const done = await processMediaWord(word(), deps, freshState());
    expect(done.audio).toBe(2);
    expect(tts.calls).toEqual(["us:apple", "uk:apple"]);
    expect(fake.uploads).toEqual(["en/apple/noun/us.mp3", "en/apple/noun/uk.mp3"]);
    expect(fake.audio.w1).toEqual({
      us: "https://cdn/en/apple/noun/us.mp3",
      uk: "https://cdn/en/apple/noun/uk.mp3",
    });
    expect(fake.clips.get("en/apple/noun/us.mp3")).toMatchObject({ kind: "word", chars: 5 });
    expect(fake.released).toEqual(["w1"]);
  });

  it("giọng đã có audio thì không tạo lại", async () => {
    const fake = fakeStore();
    const tts = okTts();
    await processMediaWord(
      word({ audioUrl: { us: "https://x", uk: null } }),
      { store: fake.store, tts, images: [] },
      freshState(),
    );
    expect(tts.calls).toEqual(["uk:apple"]);
  });

  it("tìm ảnh cho từng nghĩa; từ chức năng đánh dấu đã xét, không gọi API", async () => {
    const fake = fakeStore();
    const pexels = provider("pexels", [image("https://img/1")]);
    await processMediaWord(
      word(),
      { store: fake.store, tts: null, images: [pexels] },
      freshState(),
    );
    expect(fake.images.s1?.url).toBe("https://img/1");

    const of = word({
      id: "w2",
      lemma: "of",
      pos: "preposition",
      senses: [{ id: "s2", imageQuery: "box" }],
    });
    await processMediaWord(of, { store: fake.store, tts: null, images: [pexels] }, freshState());
    expect(fake.images).toHaveProperty("s2", null);
    expect(pexels.queries).toEqual(["red apple"]);
  });

  it("Pexels không có ảnh → thử Unsplash; cả hai không có → đánh dấu null", async () => {
    const fake = fakeStore();
    const pexels = provider("pexels", [null, null]);
    const unsplash = provider("unsplash", [image("https://u/1"), null]);
    const deps = { store: fake.store, tts: null, images: [pexels, unsplash] };
    await processMediaWord(word(), deps, freshState(10));
    expect(fake.images.s1?.url).toBe("https://u/1");
    await processMediaWord(word({ senses: [{ id: "s3", imageQuery: "x" }] }), deps, freshState(10));
    expect(fake.images).toHaveProperty("s3", null);
  });

  it("hết lượt tìm ảnh hoặc bị giới hạn → để nghĩa chưa xét, lần sau làm tiếp", async () => {
    const fake = fakeStore();
    const limited = provider("pexels", [new ImageSearchError("429", "pexels", true)]);
    await processMediaWord(
      word(),
      { store: fake.store, tts: null, images: [limited] },
      freshState(),
    );
    expect(fake.images).not.toHaveProperty("s1");

    const pexels = provider("pexels", [image("https://img/1")]);
    const twoSenses = word({
      senses: [
        { id: "a", imageQuery: "one" },
        { id: "b", imageQuery: "two" },
      ],
    });
    await processMediaWord(
      twoSenses,
      { store: fake.store, tts: null, images: [pexels] },
      freshState(1),
    );
    expect(fake.images).toHaveProperty("a");
    expect(fake.images).not.toHaveProperty("b");
  });
});

describe("runMediaWorker", () => {
  it("chưa có khóa nào → không nhận từ", async () => {
    const fake = fakeStore([word()]);
    const summary = await runMediaWorker({ store: fake.store, tts: null, images: [] });
    expect(summary.words).toBe(0);
    expect(fake.store.claimWords).not.toHaveBeenCalled();
  });

  it("không có nhà cung cấp ảnh → chỉ nhận từ thiếu audio", async () => {
    const fake = fakeStore([word()]);
    await runMediaWorker({ store: fake.store, tts: okTts(), images: [] });
    expect(fake.store.claimWords).toHaveBeenCalledWith(8, false);
  });

  it("Azure báo 429 → dừng lần chạy, trả khóa các từ còn lại", async () => {
    const fake = fakeStore([
      word({ id: "a" }),
      word({ id: "b", lemma: "pear" }),
      word({ id: "c" }),
    ]);
    let n = 0;
    const tts: TtsProvider = {
      synthesize: async () => {
        if (++n > 2) throw new TtsError("429", 429, true);
        return new Uint8Array([1]);
      },
    };
    const summary = await runMediaWorker({ store: fake.store, tts, images: [] });
    expect(summary).toMatchObject({ words: 1, audio: 2 });
    expect(summary.stopped).toContain("429");
    expect(fake.released.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("requestSentenceAudio", () => {
  const req = { senseId: SENSE, index: 0, voice: "us" as const };

  it("câu không tồn tại → not_found", async () => {
    const fake = fakeStore();
    const res = await requestSentenceAudio({ ...req, index: 5 }, "u1", {
      store: fake.store,
      tts: okTts(),
    });
    expect(res.status).toBe("not_found");
  });

  it("tạo lần đầu, lần sau dùng lại (kể cả khách), không gọi TTS lần hai", async () => {
    const fake = fakeStore();
    const tts = okTts();
    const first = await requestSentenceAudio(req, "u1", { store: fake.store, tts });
    expect(first.status).toBe("ready");
    expect(tts.calls).toEqual(["us:I eat an apple."]);
    const clip = [...fake.clips.values()][0]!;
    expect(clip).toMatchObject({ kind: "sentence", createdBy: "u1", chars: 15 });

    const again = await requestSentenceAudio(req, null, { store: fake.store, tts });
    expect(again).toEqual(first);
    expect(tts.calls).toHaveLength(1);
  });

  it("khách xin câu chưa có audio → login_required", async () => {
    const fake = fakeStore();
    expect(
      (await requestSentenceAudio(req, null, { store: fake.store, tts: okTts() })).status,
    ).toBe("login_required");
  });

  it("hết lượt trong ngày → limit_reached; TTS lỗi hoặc chưa cấu hình → unavailable", async () => {
    const limited = fakeStore([], { remaining: 0 });
    expect(await requestSentenceAudio(req, "u1", { store: limited.store, tts: okTts() })).toEqual({
      status: "limit_reached",
      dailyLimit: 100,
    });
    const fake = fakeStore();
    expect((await requestSentenceAudio(req, "u1", { store: fake.store, tts: null })).status).toBe(
      "unavailable",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: TtsProvider = {
      synthesize: async () => Promise.reject(new TtsError("x", 500, true)),
    };
    expect(
      (await requestSentenceAudio(req, "u1", { store: fake.store, tts: failing })).status,
    ).toBe("unavailable");
    expect(fake.uploads).toHaveLength(0);
  });
});
