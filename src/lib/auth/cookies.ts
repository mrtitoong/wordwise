import "server-only";
import { cookies } from "next/headers";
import { GUEST_COOKIE, ONBOARDED_COOKIE } from "./access";

const ONE_YEAR = 60 * 60 * 24 * 365;
const options = { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: true } as const;

/** Ghi cookie gợi ý trạng thái (xem lib/auth/access.ts). Chỉ gọi trong Server Action/Route Handler. */
export async function setAccessCookies(state: { guest?: boolean; onboarded?: boolean }) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  for (const [name, value] of [
    [GUEST_COOKIE, state.guest],
    [ONBOARDED_COOKIE, state.onboarded],
  ] as const) {
    if (value === undefined) continue;
    if (value) store.set(name, "1", { ...options, secure });
    else store.delete(name);
  }
}
