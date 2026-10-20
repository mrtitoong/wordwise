import { describe, expect, it } from "vitest";
import { defaultLocale, resolveLocale } from "./config";
import vi from "../messages/vi.json";
import en from "../messages/en.json";

function keyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object"
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("resolveLocale", () => {
  it("ưu tiên cookie người dùng đã chọn", () => {
    expect(resolveLocale("en", "vi-VN,vi;q=0.9")).toBe("en");
  });

  it("bỏ qua cookie không hợp lệ", () => {
    expect(resolveLocale("fr", "en-US")).toBe("en");
  });

  it("dùng Accept-Language theo trọng số q", () => {
    expect(resolveLocale(undefined, "fr-FR,fr;q=0.9,en;q=0.8,vi;q=0.7")).toBe("en");
    expect(resolveLocale(undefined, "en;q=0.3, vi-VN;q=0.9")).toBe("vi");
  });

  it("mặc định tiếng Việt khi không khớp", () => {
    expect(resolveLocale(undefined, "ja-JP,ja;q=0.9")).toBe(defaultLocale);
    expect(resolveLocale(undefined, null)).toBe("vi");
    expect(resolveLocale(undefined, "")).toBe("vi");
  });
});

describe("messages", () => {
  it("tiếng Việt và tiếng Anh có cùng bộ khóa", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(vi).sort());
  });

  it("không có chuỗi rỗng", () => {
    for (const messages of [vi, en]) {
      const empty = keyPaths(messages).filter((path) => {
        const value = path
          .split(".")
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});
