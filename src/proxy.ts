import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { GUEST_COOKIE, ONBOARDED_COOKIE, decideAccess } from "@/lib/auth/access";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Chạy trước mọi trang: làm mới phiên Supabase (ghi lại cookie) rồi quyết định
 * cho vào hay chuyển hướng (Chào mừng, Đăng nhập, Onboarding).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let signedIn = false;

  const env = getSupabaseEnv();
  if (env) {
    const supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });
    // Không chèn code giữa createServerClient và getClaims (hướng dẫn của @supabase/ssr).
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  }

  const decision = decideAccess({
    pathname: request.nextUrl.pathname,
    signedIn,
    guest: request.cookies.get(GUEST_COOKIE)?.value === "1",
    onboarded: request.cookies.get(ONBOARDED_COOKIE)?.value === "1",
  });
  if (decision.action === "allow") return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  // Giữ cookie phiên vừa làm mới.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Bỏ qua file tĩnh, ảnh và các file gốc của PWA.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json|js|css|woff2?)$).*)",
  ],
};
