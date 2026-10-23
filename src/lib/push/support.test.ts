import { describe, expect, it } from "vitest";
import { VAPID_PUBLIC_KEY } from "@/config/push";
import { pushSupport, reminderInputValue, vapidKeyBytes, type PushEnv } from "./support";

const chrome: PushEnv = {
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile",
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  permission: "default",
  maxTouchPoints: 5,
};
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";

describe("pushSupport", () => {
  it("Android/máy tính: dùng được; đã chặn thì báo; thiếu API thì không hỗ trợ", () => {
    expect(pushSupport(chrome)).toBe("ok");
    expect(pushSupport({ ...chrome, permission: "denied" })).toBe("denied");
    expect(pushSupport({ ...chrome, hasPushManager: false })).toBe("unsupported");
    expect(pushSupport({ ...chrome, permission: null })).toBe("unsupported");
  });

  it("iPhone/iPad phải thêm vào Màn hình chính trước", () => {
    expect(pushSupport({ ...chrome, userAgent: iphone })).toBe("ios-install");
    expect(pushSupport({ ...chrome, userAgent: ipad, maxTouchPoints: 5 })).toBe("ios-install");
    expect(pushSupport({ ...chrome, userAgent: iphone, standalone: true })).toBe("ok");
    // Mac thật (không cảm ứng) không phải iPad.
    expect(pushSupport({ ...chrome, userAgent: ipad, maxTouchPoints: 0 })).toBe("ok");
  });
});

describe("vapidKeyBytes", () => {
  it("khóa công khai VAPID là điểm P-256 không nén (65 byte, bắt đầu 0x04)", () => {
    const bytes = vapidKeyBytes(VAPID_PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

it("reminderInputValue", () => {
  expect(reminderInputValue("20:30:00", "20:00")).toBe("20:30");
  expect(reminderInputValue(null, "20:00")).toBe("20:00");
});
