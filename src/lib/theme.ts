/**
 * Giao diện sáng/tối (Prompt 8.2b): mặc định theo máy, chọn được Sáng/Tối trong Cài đặt. Lựa chọn
 * lưu riêng từng máy trong cookie `ww_theme` (không đồng bộ giữa các máy) để máy chủ đặt sẵn lớp
 * `dark` và đoạn script trong <head> áp trước khi vẽ – không nháy trắng lúc mở. Hàm thuần.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "ww_theme";
/** Cookie giữ một năm. */
const MAX_AGE_S = 365 * 24 * 3600;

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}

/** Có dùng giao diện tối không (`systemDark`: máy đang để chế độ tối). */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

export function themeCookie(theme: Theme): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax`;
}

/**
 * Script chạy trong <head> trước khi vẽ: đọc cookie, đặt lớp `dark` và color-scheme; theo máy thì
 * đổi theo khi máy đổi chế độ. Viết tay (không import) vì chạy trước mọi bundle.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(\\w+)/);var t=m?m[1]:"system";var q=matchMedia("(prefers-color-scheme: dark)");var a=function(){var d=t==="dark"||(t!=="light"&&q.matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"};a();q.addEventListener("change",function(){var n=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(\\w+)/);t=n?n[1]:"system";a()})}catch(e){}})();`;
