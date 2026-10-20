import { z } from "zod";

/**
 * Cài đặt thu thập ở onboarding 3 bước. Dùng chung cho khách (lưu ở máy) và
 * người có tài khoản (lưu vào user_settings).
 */
export const TARGET_LANGUAGES = ["en"] as const;
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const GOALS = ["ielts", "toeic", "communication", "work", "travel", "school"] as const;
export const DAILY_NEW_OPTIONS = [5, 10, 15, 20] as const;
export const DEFAULT_DAILY_NEW = 10;
export const STARTER_WORD_COUNT = 5;

export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type Goal = (typeof GOALS)[number];

export const onboardingSettingsSchema = z.object({
  targetLanguage: z.enum(TARGET_LANGUAGES),
  cefrLevel: z.enum(CEFR_LEVELS).nullable(),
  goals: z.array(z.enum(GOALS)).max(GOALS.length),
  dailyNewLimit: z.number().int().min(1).max(100),
  /** "HH:MM" theo giờ địa phương; null = không nhắc. */
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  timezone: z.string().min(1).max(64),
});

export type OnboardingSettings = z.infer<typeof onboardingSettingsSchema>;

/** Giá trị khi người dùng bấm "Bỏ qua" ở mọi bước. */
export function defaultOnboardingSettings(timezone = "Asia/Ho_Chi_Minh"): OnboardingSettings {
  return {
    targetLanguage: "en",
    cefrLevel: null,
    goals: [],
    dailyNewLimit: DEFAULT_DAILY_NEW,
    reminderTime: null,
    timezone,
  };
}

/** Múi giờ IANA hợp lệ (Intl nhận được), nếu không thì dùng mặc định. */
export function normalizeTimezone(
  value: string | undefined,
  fallback = "Asia/Ho_Chi_Minh",
): string {
  if (!value) return fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return fallback;
  }
}

/** Đổi sang các cột của bảng user_settings. */
export function toUserSettingsUpdate(
  settings: OnboardingSettings,
  uiLocale: "vi" | "en",
  onboardedAt: Date,
) {
  return {
    target_language: settings.targetLanguage,
    cefr_level: settings.cefrLevel,
    goals: [...settings.goals],
    daily_new_limit: settings.dailyNewLimit,
    reminder_time: settings.reminderTime,
    timezone: normalizeTimezone(settings.timezone),
    ui_locale: uiLocale,
    onboarded_at: onboardedAt.toISOString(),
  };
}
