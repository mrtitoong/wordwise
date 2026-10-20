/**
 * Ngôn ngữ giao diện. Không dùng tiền tố ngôn ngữ trên URL (quyết định GĐ1):
 * lựa chọn lưu ở cookie (và user_settings khi có tài khoản, từ Prompt 1.3).
 */
export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "vi";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Chọn ngôn ngữ: cookie (người dùng đã chọn) → Accept-Language của trình duyệt
 * → mặc định tiếng Việt.
 */
export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag = "", ...params] = part.trim().split(";");
        const q = params.find((p) => p.trim().startsWith("q="));
        return {
          lang: tag.toLowerCase().split("-")[0] ?? "",
          q: q ? Number(q.trim().slice(2)) : 1,
        };
      })
      .filter((x) => x.lang && !Number.isNaN(x.q) && x.q > 0)
      .sort((a, b) => b.q - a.q);
    for (const { lang } of ranked) {
      if (isLocale(lang)) return lang;
    }
  }
  return defaultLocale;
}
