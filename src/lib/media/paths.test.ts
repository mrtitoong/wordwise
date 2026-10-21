import { describe, expect, it } from "vitest";
import { publicAudioUrl, sentenceAudioPath, slugifyLemma, wordAudioPath } from "./paths";

describe("đường dẫn audio", () => {
  it("slug an toàn cho tên file", () => {
    expect(slugifyLemma("run")).toBe("run");
    expect(slugifyLemma("give up")).toBe("give_up");
    expect(slugifyLemma("don't")).toBe("don_t");
    expect(slugifyLemma("well-known")).toBe("well-known");
    expect(slugifyLemma("café")).toBe("cafe");
    expect(slugifyLemma("!!")).toBe("_");
  });

  it("audio của từ theo từ + loại từ + giọng (record danh từ ≠ động từ)", () => {
    expect(wordAudioPath("en", "record", "noun", "us")).toBe("en/record/noun/us.mp3");
    expect(wordAudioPath("en", "give up", "phrasal_verb", "uk")).toBe(
      "en/give_up/phrasal_verb/uk.mp3",
    );
  });

  it("audio câu theo mã băm: cùng câu cùng giọng → cùng file; khác giọng/câu → khác", async () => {
    const a = await sentenceAudioPath("en", "I run every day.", "us");
    expect(a).toMatch(/^en\/sentences\/[0-9a-f]{32}\.mp3$/);
    expect(await sentenceAudioPath("en", " I run every day. ", "us")).toBe(a);
    expect(await sentenceAudioPath("en", "I run every day.", "uk")).not.toBe(a);
    expect(await sentenceAudioPath("en", "I ran every day.", "us")).not.toBe(a);
  });

  it("khớp ràng buộc path của bảng audio_clips", async () => {
    const pattern = /^[a-z]{2}\/[a-z0-9_/.-]+\.mp3$/;
    expect(wordAudioPath("en", "Don't give up!", "phrase", "us")).toMatch(pattern);
    expect(await sentenceAudioPath("en", "x", "us")).toMatch(pattern);
  });

  it("URL công khai của bucket", () => {
    expect(publicAudioUrl("https://x.supabase.co/", "en/run/verb/us.mp3")).toBe(
      "https://x.supabase.co/storage/v1/object/public/audio/en/run/verb/us.mp3",
    );
  });
});
