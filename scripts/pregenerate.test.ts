import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readNgsl } from "./pregenerate";

describe("readNgsl", () => {
  it("đọc đủ danh sách NGSL, sắp theo tần suất, không trùng", () => {
    const items = readNgsl(readFileSync("data/wordlists/ngsl-1.2.csv", "utf8"));
    expect(items.length).toBeGreaterThan(2_700);
    expect(items[0]).toEqual({ lemma: "the", frequency_rank: 1 });
    expect(new Set(items.map((i) => i.lemma)).size).toBe(items.length);
  });

  it("bỏ dòng hỏng, làm sạch chữ", () => {
    expect(readNgsl("Lemma,SFI Rank\n Apple ,3\n,4\nbad,x\napple,5\r\n")).toEqual([
      { lemma: "apple", frequency_rank: 3 },
    ]);
  });
});
