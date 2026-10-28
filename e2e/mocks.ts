/** Giả lập dùng chung cho E2E: micro, chấm phát âm, đọc chữ trên ảnh, tra/tạo từ. */
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

// Micro giả của Chromium phát file mẫu (1,5 giây "nói" rồi im lặng, lặp lại) để có tiếng nói và
// tự dừng khi im lặng; tự cho phép quyền micro. Dùng: `test.use(FAKE_MICROPHONE)`.
const FAKE_AUDIO = resolve("tests/fixtures/audio/speech-then-silence.wav");
export const FAKE_MICROPHONE = {
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
    ],
  },
  permissions: ["microphone"],
};

export const pronunciationResult = (overall: number) => ({
  overall,
  accuracy: overall,
  fluency: 100,
  completeness: 100,
  recognized: "word",
  words: [
    {
      word: "word",
      accuracy: overall,
      errorType: overall < 60 ? "Mispronunciation" : "None",
      phonemes: [
        { ipa: "θ", score: overall < 60 ? 30 : 90 },
        { ipa: "ɪ", score: 92 },
        { ipa: "k", score: overall < 60 ? 40 : 85 },
      ],
    },
  ],
});

/** Chấm phát âm giả lập (CI không có khóa Azure): lượt thứ i được `scores[i]` (hết thì lấy số cuối). */
export async function mockPronunciation(page: Page, scores: number[]) {
  let calls = 0;
  await page.route("**/functions/v1/assess-pronunciation", async (route) => {
    const overall = scores[Math.min(calls++, scores.length - 1)]!;
    await route.fulfill({ json: { status: "ok", result: pronunciationResult(overall) } });
  });
}

export const PHOTO_TEXT =
  "Resilient people do not see setbacks as proof of failure. They are tenacous and persevere.";

/** Tài liệu OCR giả: mỗi từ một khung, xếp 6 từ một dòng (vị trí không cần khớp ảnh thật). */
export function fakeDocument() {
  const parts = PHOTO_TEXT.match(/[A-Za-z]+|[.]/g)!;
  let sentence = 0;
  let word = 0;
  return {
    source: "vision",
    meanConfidence: 0.97,
    skewDegrees: 0.5,
    tokens: parts.map((text, i) => {
      const isWord = /[A-Za-z]/.test(text);
      const slot = isWord ? word++ : word - 1;
      const token = {
        text,
        kind: isWord ? "word" : "punct",
        boxes: isWord
          ? [{ x: 0.05 + (slot % 6) * 0.15, y: 0.1 + Math.floor(slot / 6) * 0.1, w: 0.13, h: 0.06 }]
          : [],
        confidence: isWord ? 0.97 : null,
        spaceBefore: i > 0 && isWord,
        paragraph: 0,
        sentence,
      };
      if (text === ".") sentence++;
      return token;
    }),
  };
}

/** Từ trong kho (seed) dùng cho tra từ giả; từ thường gặp cho CEFR A1 (không tự chọn). */
const LIBRARY: Record<
  string,
  { lemma: string; cefr: string; senses: [string, string][] } | undefined
> = {
  resilient: {
    lemma: "resilient",
    cefr: "C1",
    senses: [
      ["51c8ac6a-0d9c-41f6-833e-7ec0dda38a1d", "kiên cường"],
      ["b7b69480-9d73-4625-9deb-3e7d4d2d2235", "đàn hồi"],
    ],
  },
  setbacks: {
    lemma: "setback",
    cefr: "C1",
    senses: [["9e0a3013-a304-4fa6-8e72-14caca72f4cf", "sự thụt lùi"]],
  },
  tenacious: {
    lemma: "tenacious",
    cefr: "C2",
    senses: [["e94c4fec-fe93-4f4d-9c96-8b80e0490084", "kiên trì"]],
  },
};
const COMMON = new Set(["people", "see", "proof", "failure", "they", "are", "and"]);

/** Đọc chữ (ocr-image) và tra/tạo từ (generate-word) giả lập cho luồng thêm từ bằng ảnh. */
export async function mockPhotoFunctions(page: Page) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/ocr-image", (route) =>
    route.fulfill({ json: { status: "ok", document: fakeDocument() } }),
  );
  await page.route("**/functions/v1/generate-word", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body.action === "resolve") {
      const items = (body.lemmas as string[]).map((input) => {
        const known = LIBRARY[input];
        if (known) {
          return {
            input,
            lemma: known.lemma,
            alternatives: [],
            words: [
              {
                id: `w-${known.lemma}`,
                lemma: known.lemma,
                pos: "adjective",
                cefr: known.cefr,
                senses: known.senses.map(([id, meaning_vi]) => ({ id, meaning_vi })),
              },
            ],
          };
        }
        if (COMMON.has(input)) {
          return {
            input,
            lemma: input,
            alternatives: [],
            words: [
              {
                id: `w-${input}`,
                lemma: input,
                pos: "noun",
                cefr: "A1",
                senses: [{ id: `common-${input}`, meaning_vi: input }],
              },
            ],
          };
        }
        return { input, lemma: input, alternatives: [], words: [] };
      });
      return route.fulfill({ json: { items } });
    }
    return route.fulfill({
      json: { status: "preparing", lemma: body.lemma, alternatives: [], jobId: "job-1" },
    });
  });
  return requests;
}

export const ARTICLE_URL = "https://news.example/resilience";
export const ARTICLE_TEXT =
  "Resilient people do not see setbacks as proof of failure.\n\nThey are tenacious and persevere.";

/**
 * Đọc bài từ link (fetch-article) giả lập; tra/tạo từ dùng chung bản giả của tab Ảnh. Link có
 * "paywall" trả lỗi tải trang (để thử dán nội dung).
 */
export async function mockArticleFunctions(page: Page) {
  const requests = await mockPhotoFunctions(page);
  await page.route("**/functions/v1/fetch-article", async (route) => {
    const body = route.request().postDataJSON() as { url: string };
    requests.push({ action: "fetch-article", ...body });
    if (body.url.includes("paywall")) return route.fulfill({ json: { status: "fetch_failed" } });
    return route.fulfill({
      json: {
        status: "ok",
        url: ARTICLE_URL,
        title: "How resilient people bounce back",
        siteName: "News Example",
        text: ARTICLE_TEXT,
        truncated: false,
      },
    });
  });
  return requests;
}
