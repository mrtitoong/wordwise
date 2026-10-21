import { describe, expect, it } from "vitest";
import { lookupHref, wordHref } from "./links";

describe("links", () => {
  it("thẻ từ và trang tìm từ", () => {
    expect(wordHref("abc")).toBe("/words/abc");
    expect(lookupHref("give up")).toBe("/words/lookup?lemma=give+up");
    expect(lookupHref("resilience", "noun", true)).toBe(
      "/words/lookup?lemma=resilience&pos=noun&add=1",
    );
  });
});
