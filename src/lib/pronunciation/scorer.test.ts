import { describe, expect, it, vi } from "vitest";
import { base64ToBytes } from "@/lib/voice/wav";
import { PronunciationResultSchema } from "./api";
import {
  assessmentHeader,
  assessmentParams,
  createAzureScorer,
  parseAzureAssessment,
  type AzureAssessment,
} from "./scorer";

/** Kết quả REST (format=detailed) khi đọc "think" hơi sai âm /θ/. */
const THINK: AzureAssessment = {
  RecognitionStatus: "Success",
  DisplayText: "Think.",
  NBest: [
    {
      Lexical: "think",
      Display: "Think.",
      AccuracyScore: 71,
      FluencyScore: 100,
      CompletenessScore: 100,
      PronScore: 79.6,
      Words: [
        {
          Word: "think",
          AccuracyScore: 71,
          ErrorType: "Mispronunciation",
          Phonemes: [
            { Phoneme: "θ", AccuracyScore: 32 },
            { Phoneme: "ɪ", AccuracyScore: 92 },
            { Phoneme: "ŋ", AccuracyScore: 88 },
            { Phoneme: "k", AccuracyScore: 74 },
          ],
        },
      ],
    },
  ],
};

describe("assessmentParams", () => {
  it("chấm tới âm vị, thang 100; IPA chỉ với en-US", () => {
    expect(assessmentParams("think", "en-US")).toEqual({
      ReferenceText: "think",
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      PhonemeAlphabet: "IPA",
    });
    expect(assessmentParams("think", "en-GB")).not.toHaveProperty("PhonemeAlphabet");
  });

  it("header là JSON mã hóa base64", () => {
    const header = assessmentHeader("look after", "en-US");
    const decoded = JSON.parse(new TextDecoder().decode(base64ToBytes(header))) as {
      ReferenceText: string;
    };
    expect(decoded.ReferenceText).toBe("look after");
  });
});

describe("parseAzureAssessment", () => {
  it("điểm tổng, từng từ, từng âm vị", () => {
    const outcome = parseAzureAssessment(THINK);
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(PronunciationResultSchema.parse(outcome.result)).toEqual({
      overall: 79.6,
      accuracy: 71,
      fluency: 100,
      completeness: 100,
      recognized: "Think.",
      words: [
        {
          word: "think",
          accuracy: 71,
          errorType: "Mispronunciation",
          phonemes: [
            { ipa: "θ", score: 32 },
            { ipa: "ɪ", score: 92 },
            { ipa: "ŋ", score: 88 },
            { ipa: "k", score: 74 },
          ],
        },
      ],
    });
  });

  it("nhận cả dạng điểm lồng trong PronunciationAssessment (SDK)", () => {
    const outcome = parseAzureAssessment({
      RecognitionStatus: "Success",
      NBest: [
        {
          Lexical: "cat",
          PronunciationAssessment: { AccuracyScore: 90, PronScore: 91, FluencyScore: 95 },
          Words: [
            {
              Word: "cat",
              PronunciationAssessment: { AccuracyScore: 90, ErrorType: "None" },
              Phonemes: [{ Phoneme: "k", PronunciationAssessment: { AccuracyScore: 100 } }],
            },
          ],
        },
      ],
    });
    expect(outcome).toMatchObject({
      status: "ok",
      result: { overall: 91, recognized: "cat", words: [{ phonemes: [{ ipa: "k", score: 100 }] }] },
    });
  });

  it("giọng Anh (không có tên âm vị): ipa null, vẫn có điểm", () => {
    const outcome = parseAzureAssessment({
      RecognitionStatus: "Success",
      NBest: [
        {
          Display: "Water.",
          AccuracyScore: 88,
          PronScore: 90,
          Words: [{ Word: "water", AccuracyScore: 88, Phonemes: [{ AccuracyScore: 95 }] }],
        },
      ],
    });
    expect(outcome).toMatchObject({
      status: "ok",
      result: { words: [{ errorType: "None", phonemes: [{ ipa: null, score: 95 }] }] },
    });
  });

  it("im lặng, không khớp, hoặc bỏ sót hết từ: no_speech", () => {
    expect(parseAzureAssessment({ RecognitionStatus: "InitialSilenceTimeout" })).toEqual({
      status: "no_speech",
    });
    expect(parseAzureAssessment({ RecognitionStatus: "NoMatch" })).toEqual({ status: "no_speech" });
    expect(
      parseAzureAssessment({
        RecognitionStatus: "Success",
        NBest: [{ Words: [{ Word: "think", ErrorType: "Omission", AccuracyScore: 0 }] }],
      }),
    ).toEqual({ status: "no_speech" });
  });

  it("giới hạn điểm 0–100, làm tròn 1 chữ số", () => {
    const outcome = parseAzureAssessment({
      RecognitionStatus: "Success",
      NBest: [{ AccuracyScore: 101.234, PronScore: -3, Words: [] }],
    });
    expect(outcome).toMatchObject({ result: { accuracy: 100, overall: 0 } });
  });
});

describe("createAzureScorer", () => {
  it("gửi WAV kèm header chấm điểm tới đúng vùng và ngôn ngữ", async () => {
    const fetchMock = vi.fn(async () => Response.json(THINK));
    const scorer = createAzureScorer({ key: "k", region: "southeastasia", fetch: fetchMock });
    const outcome = await scorer.assess(new Uint8Array([1, 2, 3]), "think", "en-US");
    expect(outcome.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://southeastasia.stt.speech.microsoft.com/speech/recognition/conversation/" +
        "cognitiveservices/v1?language=en-US&format=detailed",
    );
    const headers = init.headers as Record<string, string>;
    expect(headers["Ocp-Apim-Subscription-Key"]).toBe("k");
    expect(headers["Content-Type"]).toContain("samplerate=16000");
    expect(headers["Pronunciation-Assessment"]).toBe(assessmentHeader("think", "en-US"));
  });

  it("Azure báo lỗi thì ném lỗi (handler trả unavailable)", async () => {
    const scorer = createAzureScorer({
      key: "k",
      region: "r",
      fetch: async () => new Response("bad key", { status: 401 }),
    });
    await expect(scorer.assess(new Uint8Array(), "x", "en-GB")).rejects.toThrow("401");
  });
});
