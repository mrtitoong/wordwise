import { describe, expect, it } from "vitest";
import {
  PREFETCH_MAX_FILES,
  prefetchItems,
  prefetchPolicy,
  senseIdsDueBy,
  type MediaSource,
} from "./prefetch";

describe("prefetchPolicy", () => {
  it("Wi-Fi/mạng dây: audio và ảnh", () => {
    expect(prefetchPolicy({ online: true, type: "wifi" })).toEqual({
      strokes: true,
      audio: true,
      images: true,
    });
    expect(prefetchPolicy({ online: true, type: "ethernet" })).toEqual({
      strokes: true,
      audio: true,
      images: true,
    });
  });

  it("4G, offline, tiết kiệm dữ liệu: không tải", () => {
    const none = { strokes: false, audio: false, images: false };
    expect(prefetchPolicy({ online: true, type: "cellular" })).toEqual({ ...none, strokes: true });
    expect(prefetchPolicy({ online: false, type: "wifi" })).toEqual(none);
    expect(prefetchPolicy({ online: true, type: "wifi", saveData: true })).toEqual(none);
  });

  it("không biết loại mạng (iPhone, máy tính): chỉ audio", () => {
    expect(prefetchPolicy({ online: true })).toEqual({
      strokes: true,
      audio: true,
      images: false,
    });
  });
});

describe("senseIdsDueBy", () => {
  const TZ = "Asia/Ho_Chi_Minh";
  // 10:00 sáng 26/10 giờ VN; ngày học mai kết thúc 4:00 sáng 28/10 giờ VN.
  const now = new Date("2026-10-26T03:00:00Z");
  const uw = (id: string, status = "learning", deleted_at: string | null = null) => ({
    id,
    sense_id: `s-${id}`,
    status,
    deleted_at,
  });
  const card = (user_word_id: string, due: string, deleted_at: string | null = null) => ({
    user_word_id,
    due,
    deleted_at,
  });

  it("thẻ đến hạn hôm nay, quá hạn, và tới 3:59 sáng ngày kia (còn thuộc ngày học mai)", () => {
    const ids = senseIdsDueBy(
      [
        card("a", "2026-10-20T00:00:00Z"),
        card("b", "2026-10-27T12:00:00Z"),
        card("c", "2026-10-27T20:59:00Z"), // 3:59 sáng 28/10 giờ VN
        card("d", "2026-10-27T21:00:00Z"), // 4:00 sáng 28/10: ngày học kia
      ],
      [uw("a"), uw("b"), uw("c"), uw("d")],
      now,
      TZ,
    );
    expect(ids.sort()).toEqual(["s-a", "s-b", "s-c"]);
  });

  it("bỏ thẻ/từ đã xóa, từ tạm ngưng, từ còn ở Sắp học; một nghĩa nhiều thẻ chỉ tính một", () => {
    const due = "2026-10-26T00:00:00Z";
    const ids = senseIdsDueBy(
      [
        card("a", due),
        card("a", due),
        card("b", due, "2026-10-25T00:00:00Z"),
        card("c", due),
        card("d", due),
        card("e", due),
      ],
      [uw("a"), uw("b"), uw("c", "suspended"), uw("d", "queued"), uw("e", "learning", due)],
      now,
      TZ,
    );
    expect(ids).toEqual(["s-a"]);
  });
});

describe("prefetchItems", () => {
  const all = { strokes: true, audio: true, images: true };
  const source = (n: number, image: string | null = `https://img/${n}.jpg`): MediaSource => ({
    word: {
      lemma: `word${n}`,
      language: "en",
      audio_us_url: `https://a/${n}/us.mp3`,
      audio_uk_url: `https://a/${n}/uk.mp3`,
    },
    sense: { image_url: image },
    examples: [{ sentence: `S${n}a` }, { sentence: `S${n}b` }, { sentence: `S${n}c` }],
  });

  it("giọng đang chọn, 2 câu ví dụ mỗi nghĩa, ảnh sau audio", () => {
    const items = prefetchItems([source(1)], "uk", all);
    expect(items).toEqual([
      { kind: "audio", url: "https://a/1/uk.mp3" },
      { kind: "sentence", sentence: "S1a", language: "en", voice: "uk" },
      { kind: "sentence", sentence: "S1b", language: "en", voice: "uk" },
      { kind: "image", url: "https://img/1.jpg" },
    ]);
  });

  it("chỉ audio khi không cho ảnh; bỏ trùng (hai nghĩa của cùng một từ)", () => {
    const twoSenses = [source(1), { ...source(1), sense: { image_url: null } }];
    const items = prefetchItems(twoSenses, "us", { ...all, images: false });
    expect(items.map((i) => i.kind)).toEqual(["audio", "sentence", "sentence"]);
  });

  it("không quá PREFETCH_MAX_FILES file", () => {
    const many = Array.from({ length: 200 }, (_, i) => source(i));
    expect(prefetchItems(many, "us", all)).toHaveLength(PREFETCH_MAX_FILES);
  });

  it("tiếng Trung: nét của từng chữ trước tiên, chọn giọng Anh vẫn tải được audio", () => {
    const chinese: MediaSource = {
      word: {
        lemma: "学校",
        language: "zh",
        audio_us_url: "https://a/zh/us.mp3",
        audio_uk_url: null,
      },
      sense: { image_url: null },
      examples: [{ sentence: "我去学校。" }],
    };
    expect(prefetchItems([chinese], "uk", all)).toEqual([
      { kind: "strokes", url: "/hanzi/%E5%AD%A6.json" },
      { kind: "strokes", url: "/hanzi/%E6%A0%A1.json" },
      { kind: "audio", url: "https://a/zh/us.mp3" },
      { kind: "sentence", sentence: "我去学校。", language: "zh", voice: "us" },
    ]);
  });

  it("dùng 4G chỉ tải nét chữ", () => {
    const chinese = { ...source(1), word: { ...source(1).word, lemma: "人", language: "zh" } };
    const items = prefetchItems(
      [chinese],
      "us",
      prefetchPolicy({ online: true, type: "cellular" }),
    );
    expect(items.map((item) => item.kind)).toEqual(["strokes"]);
  });
});
