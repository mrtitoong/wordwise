import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/srs/simulate";
import {
  FREE_REPLAYS,
  listeningTaskKind,
  listeningVoice,
  replaysAsHint,
  spellingTaskKind,
} from "./listening";

const all = { word: true, sentence: true };

describe("spellingTaskKind", () => {
  it("mức 0–1 chỉ tập viết", () => {
    for (const level of [0, 1] as const) {
      for (const r of [0, 0.5, 0.99]) expect(spellingTaskKind(level, all, () => r)).toBe("writing");
    }
  });

  it("mức 2: tập viết hoặc nghe → gõ lại", () => {
    expect(spellingTaskKind(2, all, () => 0)).toBe("writing");
    expect(spellingTaskKind(2, all, () => 0.9)).toBe("listen-type");
  });

  it("mức 3: cả ba dạng; mức 4: tập viết hoặc nghe câu → điền từ", () => {
    const random = seededRandom(11);
    const kinds = new Set(Array.from({ length: 60 }, () => spellingTaskKind(3, all, random)));
    expect(kinds).toEqual(new Set(["writing", "listen-type", "listen-cloze"]));
    const top = new Set(Array.from({ length: 60 }, () => spellingTaskKind(4, all, random)));
    expect(top).toEqual(new Set(["writing", "listen-cloze"]));
  });

  it("không phát được âm thanh thì bỏ dạng nghe", () => {
    const none = { word: false, sentence: false };
    for (const level of [2, 3, 4] as const) {
      expect(spellingTaskKind(level, none, () => 0.99)).toBe("writing");
    }
    expect(spellingTaskKind(4, { word: true, sentence: false }, () => 0.99)).toBe("writing");
    expect(spellingTaskKind(3, { word: false, sentence: true }, () => 0.99)).toBe("listen-cloze");
  });
});

describe("listeningVoice, replaysAsHint", () => {
  it("tắt Luyện nhiều giọng: luôn giọng trong Cài đặt", () => {
    expect(listeningVoice("uk", false, () => 0)).toBe("uk");
    expect(listeningVoice("us", false, () => 0.9)).toBe("us");
  });

  it("bật: ngẫu nhiên Mỹ/Anh", () => {
    const random = seededRandom(3);
    const voices = Array.from({ length: 100 }, () => listeningVoice("us", true, random));
    const uk = voices.filter((v) => v === "uk").length;
    expect(uk).toBeGreaterThan(30);
    expect(uk).toBeLessThan(70);
  });

  it(`nghe lại quá ${FREE_REPLAYS} lần là dùng gợi ý`, () => {
    expect(replaysAsHint(0)).toBe(false);
    expect(replaysAsHint(FREE_REPLAYS)).toBe(false);
    expect(replaysAsHint(FREE_REPLAYS + 1)).toBe(true);
  });
});

describe("listeningTaskKind (Luyện tập chọn Tập nghe)", () => {
  it("nghe → gõ ở mọi mức; nghe câu → điền từ từ mức 3", () => {
    expect(listeningTaskKind(0, all, () => 0.99)).toBe("listen-type");
    expect(listeningTaskKind(3, all, () => 0.99)).toBe("listen-cloze");
    expect(listeningTaskKind(3, all, () => 0)).toBe("listen-type");
  });

  it("không phát được thì null", () => {
    expect(listeningTaskKind(4, { word: false, sentence: false })).toBeNull();
    expect(listeningTaskKind(1, { word: false, sentence: true })).toBeNull();
  });
});
