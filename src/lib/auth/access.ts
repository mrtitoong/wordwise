/**
 * Quyết định cho phép vào trang hay chuyển hướng. Hàm thuần, dùng trong proxy.ts.
 *
 * Trạng thái người dùng lấy từ phiên Supabase và hai cookie gợi ý:
 * - GUEST_COOKIE: đã bấm "Dùng thử ngay" (dữ liệu chỉ ở máy).
 * - ONBOARDED_COOKIE: đã xong onboarding (khách: lưu ở máy; có tài khoản: đặt
 *   lại từ user_settings.onboarded_at mỗi lần đăng nhập).
 */
export const GUEST_COOKIE = "ww_guest";
export const ONBOARDED_COOKIE = "ww_onboarded";

export type AccessInput = {
  pathname: string;
  signedIn: boolean;
  guest: boolean;
  onboarded: boolean;
};

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

const ONBOARDING_PATH = "/onboarding";

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideAccess({
  pathname,
  signedIn,
  guest,
  onboarded,
}: AccessInput): AccessDecision {
  const started = signedIn || guest;

  // /auth/*: xử lý link đăng nhập, ai cũng vào được.
  if (matches(pathname, "/auth")) return { action: "allow" };
  // Trang báo mất mạng (Service Worker lưu sẵn để trả khi offline): ai cũng vào được.
  if (matches(pathname, "/offline")) return { action: "allow" };
  // Trang báo trình duyệt quá cũ: ai cũng vào được.
  if (matches(pathname, "/unsupported")) return { action: "allow" };

  if (matches(pathname, "/welcome") || matches(pathname, "/login")) {
    // Khách vẫn vào được /login để tạo tài khoản; người đã đăng nhập thì không cần.
    if (signedIn) return { action: "redirect", to: "/" };
    if (guest && matches(pathname, "/welcome")) return { action: "redirect", to: "/" };
    return { action: "allow" };
  }

  if (!started) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return { action: "redirect", to: `/welcome${next}` };
  }

  // Trang quản trị cần tài khoản; vai trò admin kiểm tra tiếp ở server và RLS.
  if (matches(pathname, "/admin")) {
    return signedIn
      ? { action: "allow" }
      : { action: "redirect", to: `/login?next=${encodeURIComponent(pathname)}` };
  }

  if (matches(pathname, ONBOARDING_PATH)) {
    return onboarded ? { action: "redirect", to: "/" } : { action: "allow" };
  }

  if (!onboarded) return { action: "redirect", to: ONBOARDING_PATH };
  return { action: "allow" };
}

/**
 * Chỉ nhận đường dẫn nội bộ cho tham số ?next= (chặn chuyển hướng ra ngoài,
 * vd "//evil.com" hay "/\evil.com").
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
