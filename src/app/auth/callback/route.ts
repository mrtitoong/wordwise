import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/** Quay về từ Google OAuth (PKCE): đổi ?code= lấy phiên đăng nhập. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(
        new URL(`/auth/finish?next=${encodeURIComponent(next)}`, request.url),
      );
    }
    console.error("auth/callback", error.message);
  }
  // Người dùng hủy ở Google (?error=access_denied) hoặc code hỏng.
  return NextResponse.redirect(new URL("/login?error=oauth", request.url));
}
