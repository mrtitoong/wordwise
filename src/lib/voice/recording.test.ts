import { describe, expect, it } from "vitest";
import {
  LEVEL_HISTORY,
  SILENCE_STOP_MS,
  createSilenceDetector,
  pickMimeType,
  pushLevel,
} from "./recording";

describe("pickMimeType", () => {
  it("Chrome: WebM Opus", () => {
    expect(pickMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
  });

  it("Safari iOS: MP4", () => {
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("không định dạng nào được báo hỗ trợ: để trình duyệt tự chọn", () => {
    expect(pickMimeType(() => false)).toBe("");
  });

  it("trình duyệt ném lỗi với chuỗi lạ: thử tiếp", () => {
    expect(
      pickMimeType((t) => {
        if (t.includes("codecs")) throw new Error("not supported");
        return t === "audio/webm";
      }),
    ).toBe("audio/webm");
  });
});

describe("createSilenceDetector", () => {
  /** Đưa một dãy mức âm lượng, mỗi mức cách nhau 50 ms; trả thời điểm dừng (hoặc null). */
  function run(levels: number[], step = 50) {
    const detector = createSilenceDetector();
    for (let i = 0; i < levels.length; i++) {
      if (detector.push(levels[i]!, i * step)) return { stopAt: i * step, detector };
    }
    return { stopAt: null, detector };
  }
  const quiet = (n: number) => Array<number>(n).fill(0.005);
  const loud = (n: number) => Array<number>(n).fill(0.1);

  it("nói rồi im lặng 1,2 giây thì dừng", () => {
    const { stopAt, detector } = run([...quiet(4), ...loud(10), ...quiet(40)]);
    expect(detector.heardSpeech()).toBe(true);
    // Bắt đầu im lặng ở mẫu 14 (700 ms) → dừng ở 700 + 1200.
    expect(stopAt).toBe(700 + SILENCE_STOP_MS);
  });

  it("chưa nói gì thì không tự dừng (chờ tới giới hạn thời gian)", () => {
    const { stopAt, detector } = run(quiet(200));
    expect(stopAt).toBeNull();
    expect(detector.heardSpeech()).toBe(false);
  });

  it("tiếng lạch cạch ngắn không tính là nói", () => {
    const { stopAt, detector } = run([...quiet(4), ...loud(2), ...quiet(60)]);
    expect(stopAt).toBeNull();
    expect(detector.heardSpeech()).toBe(false);
  });

  it("ngừng giữa chừng ngắn hơn 1,2 giây thì nghe tiếp", () => {
    const { stopAt } = run([...loud(10), ...quiet(20), ...loud(10), ...quiet(10)]);
    expect(stopAt).toBeNull();
  });
});

describe("pushLevel", () => {
  it("giữ tối đa LEVEL_HISTORY mức, mới nhất ở cuối, giới hạn 0–1", () => {
    let history: number[] = [];
    for (let i = 0; i < LEVEL_HISTORY + 5; i++) history = pushLevel(history, i === 0 ? 1 : 0);
    expect(history).toHaveLength(LEVEL_HISTORY);
    expect(history.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(pushLevel([], 0.5).at(-1)).toBe(1);
    expect(pushLevel([], -1).at(-1)).toBe(0);
  });
});
