import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Link trong email đăng nhập (mẫu supabase/templates/magic-link.html):
 * /auth/confirm?next=/...&token_hash=...&type=email. Dùng token_hash nên mở
 * được trên trình duyệt khác với nơi yêu cầu link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return redirectTo(request, `/auth/finish?next=${encodeURIComponent(next)}`);
  }
  return redirectTo(request, "/login?error=link_expired");
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}
