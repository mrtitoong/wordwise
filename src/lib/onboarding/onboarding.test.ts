import { describe, expect, it } from "vitest";
import {
  emptyGuestData,
  hasGuestContent,
  parseGuestData,
  planGuestMerge,
  type GuestData,
} from "./guest-data";
import {
  defaultOnboardingSettings,
  normalizeTimezone,
  onboardingSettingsSchema,
  toUserSettingsUpdate,
} from "./settings";
import { pickStarterWords, type StarterCandidate } from "./starter-words";

const SENSE_A = "60db4402-ca9b-4997-baa8-ddd85db1b21d";
const SENSE_B = "a13fc340-7924-407d-818f-fb4c52573c3c";

describe("onboarding settings", () => {
  it("giá trị mặc định khi bỏ qua hợp lệ", () => {
    const settings = defaultOnboardingSettings();
    expect(onboardingSettingsSchema.parse(settings)).toEqual(settings);
    expect(settings.dailyNewLimit).toBe(10);
  });

  it("giờ nhắc phải dạng HH:MM", () => {
    const base = defaultOnboardingSettings();
    expect(onboardingSettingsSchema.safeParse({ ...base, reminderTime: "20:30" }).success).toBe(
      true,
    );
    for (const bad of ["24:00", "8:30", "20:60", "abc"]) {
      expect(onboardingSettingsSchema.safeParse({ ...base, reminderTime: bad }).success).toBe(
        false,
      );
    }
  });

  it("múi giờ lạ thì dùng mặc định", () => {
    expect(normalizeTimezone("Europe/London")).toBe("Europe/London");
    expect(normalizeTimezone("Mars/Base")).toBe("Asia/Ho_Chi_Minh");
    expect(normalizeTimezone(undefined)).toBe("Asia/Ho_Chi_Minh");
  });

  it("đổi sang cột user_settings", () => {
    const at = new Date("2026-10-20T01:00:00Z");
    const row = toUserSettingsUpdate(
      {
        targetLanguage: "en",
        cefrLevel: "B1",
        goals: ["ielts", "work"],
        dailyNewLimit: 15,
        reminderTime: "20:00",
        timezone: "Asia/Ho_Chi_Minh",
      },
      "vi",
      at,
    );
    expect(row).toEqual({
      target_language: "en",
      cefr_level: "B1",
      goals: ["ielts", "work"],
      daily_new_limit: 15,
      reminder_time: "20:00",
      timezone: "Asia/Ho_Chi_Minh",
      ui_locale: "vi",
      onboarded_at: "2026-10-20T01:00:00.000Z",
    });
  });
});

describe("pickStarterWords", () => {
  const words: StarterCandidate[] = [
    { senseId: "1", lemma: "colour", cefr: "A1" },
    { senseId: "2", lemma: "meet", cefr: "A1" },
    { senseId: "3", lemma: "bank", cefr: "A2" },
    { senseId: "4", lemma: "bank", cefr: "A2" },
    { senseId: "5", lemma: "borrow", cefr: "A2" },
    { senseId: "6", lemma: "affect", cefr: "B1" },
    { senseId: "7", lemma: "deadline", cefr: "B1" },
    { senseId: "8", lemma: "sustainable", cefr: "B2" },
    { senseId: "9", lemma: "mitigate", cefr: "C1" },
    { senseId: "10", lemma: "tenacious", cefr: "C2" },
    { senseId: "11", lemma: "mystery", cefr: null },
  ];

  it("ưu tiên đúng trình độ, rồi dễ hơn một bậc, rồi khó hơn", () => {
    expect(pickStarterWords(words, "B1").map((w) => w.lemma)).toEqual([
      "affect",
      "deadline",
      "bank",
      "borrow",
      "sustainable",
    ]);
  });

  it("mỗi lemma chỉ lấy một nghĩa", () => {
    const picked = pickStarterWords(words, "A2");
    expect(picked.filter((w) => w.lemma === "bank")).toHaveLength(1);
  });

  it("chưa chọn trình độ thì dùng A2", () => {
    expect(pickStarterWords(words, null)[0]?.cefr).toBe("A2");
  });

  it("không đủ từ thì trả bấy nhiêu, từ không rõ trình độ xếp cuối", () => {
    expect(pickStarterWords(words.slice(0, 2), "C1")).toHaveLength(2);
    expect(pickStarterWords(words, "C1", 20).at(-1)?.lemma).toBe("mystery");
  });
});

describe("guest data", () => {
  const guest: GuestData = {
    version: 1,
    settings: { ...defaultOnboardingSettings(), cefrLevel: "B2" },
    onboardedAt: "2026-10-20T02:00:00.000Z",
    senseIds: [SENSE_A, SENSE_B, SENSE_A],
  };

  it("đọc lại được dữ liệu đã lưu, bỏ qua dữ liệu hỏng", () => {
    expect(parseGuestData(JSON.stringify(guest))).toEqual(guest);
    expect(parseGuestData(null)).toBeNull();
    expect(parseGuestData("{not json")).toBeNull();
    expect(parseGuestData(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseGuestData(JSON.stringify({ ...guest, senseIds: ["x"] }))).toBeNull();
  });

  it("chỉ coi là có dữ liệu khi có cài đặt hoặc từ", () => {
    expect(hasGuestContent(emptyGuestData())).toBe(false);
    expect(hasGuestContent(null)).toBe(false);
    expect(hasGuestContent(guest)).toBe(true);
  });

  it("tài khoản mới: lấy cài đặt của khách", () => {
    const plan = planGuestMerge(guest, false);
    expect(plan.settings?.cefrLevel).toBe("B2");
    expect(plan.onboardedAt?.toISOString()).toBe("2026-10-20T02:00:00.000Z");
    expect(plan.senseIds).toEqual([SENSE_A, SENSE_B]);
  });

  it("tài khoản đã có dữ liệu: giữ cài đặt tài khoản, chỉ cộng thêm từ", () => {
    const plan = planGuestMerge(guest, true);
    expect(plan.settings).toBeNull();
    expect(plan.onboardedAt).toBeNull();
    expect(plan.senseIds).toEqual([SENSE_A, SENSE_B]);
  });
});
