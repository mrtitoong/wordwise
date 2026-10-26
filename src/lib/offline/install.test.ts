import { describe, expect, it } from "vitest";
import { installMode } from "./install";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

const env = (userAgent: string, extra: Partial<Parameters<typeof installMode>[0]> = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  canPrompt: false,
  ...extra,
});

describe("installMode", () => {
  it("mở từ màn hình chính: đã cài", () => {
    expect(installMode(env(ANDROID, { standalone: true, canPrompt: true }))).toBe("installed");
    expect(installMode(env(IPHONE, { standalone: true }))).toBe("installed");
  });

  it("trình duyệt có hộp thoại cài: bấm là cài", () => {
    expect(installMode(env(ANDROID, { canPrompt: true }))).toBe("prompt");
  });

  it("iPhone, iPad (kể cả iPad báo là Mac): hướng dẫn Chia sẻ", () => {
    expect(installMode(env(IPHONE))).toBe("ios");
    expect(installMode(env(IPAD_AS_MAC, { maxTouchPoints: 5 }))).toBe("ios");
  });

  it("chưa có hộp thoại (máy tính Mac không cảm ứng, Android chưa sẵn sàng): hướng dẫn menu", () => {
    expect(installMode(env(IPAD_AS_MAC))).toBe("menu");
    expect(installMode(env(ANDROID))).toBe("menu");
  });
});
