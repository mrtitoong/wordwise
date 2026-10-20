import { z } from "zod";
import { onboardingSettingsSchema, type OnboardingSettings } from "./settings";

/**
 * Dữ liệu của khách (chế độ "Dùng thử ngay"), chỉ nằm ở máy. Prompt 1.3 mới có
 * cài đặt onboarding và các từ khởi đầu; Prompt 1.4 chuyển sang Dexie và thêm
 * từ, lịch ôn.
 */
export const GUEST_STORAGE_KEY = "wordwise.guest.v1";
export const MAX_GUEST_WORDS = 50;

export const guestDataSchema = z.object({
  version: z.literal(1),
  settings: onboardingSettingsSchema.nullable(),
  onboardedAt: z.iso.datetime().nullable(),
  /** Nghĩa (word_senses.id) khách đã thêm vào "Sổ của tôi". */
  senseIds: z.array(z.uuid()).max(MAX_GUEST_WORDS),
});

export type GuestData = z.infer<typeof guestDataSchema>;

export function emptyGuestData(): GuestData {
  return { version: 1, settings: null, onboardedAt: null, senseIds: [] };
}

/** Đọc JSON từ localStorage; hỏng hoặc sai cấu trúc thì coi như chưa có. */
export function parseGuestData(raw: string | null): GuestData | null {
  if (!raw) return null;
  try {
    const result = guestDataSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function hasGuestContent(data: GuestData | null): data is GuestData {
  return !!data && (data.settings !== null || data.senseIds.length > 0);
}

export type GuestMergePlan = {
  /** Cài đặt cần ghi vào user_settings, null = giữ nguyên của tài khoản. */
  settings: OnboardingSettings | null;
  onboardedAt: Date | null;
  /** Nghĩa cần thêm (bỏ trùng); trùng với tài khoản thì DB bỏ qua. */
  senseIds: string[];
};

/**
 * Gộp dữ liệu khách vào tài khoản, không ghi đè (docs/ux-flows.md §2.1):
 * tài khoản đã onboarding thì giữ cài đặt của tài khoản; từ thì cộng thêm.
 */
export function planGuestMerge(guest: GuestData, accountOnboarded: boolean): GuestMergePlan {
  const useGuestSettings = !accountOnboarded && guest.settings !== null;
  return {
    settings: useGuestSettings ? guest.settings : null,
    onboardedAt: useGuestSettings ? new Date(guest.onboardedAt ?? Date.now()) : null,
    senseIds: [...new Set(guest.senseIds)],
  };
}
