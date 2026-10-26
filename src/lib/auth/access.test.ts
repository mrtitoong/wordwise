import { describe, expect, it } from "vitest";
import { decideAccess, safeNextPath, type AccessInput } from "./access";

const visitor = { signedIn: false, guest: false, onboarded: false };
const newGuest = { signedIn: false, guest: true, onboarded: false };
const guest = { signedIn: false, guest: true, onboarded: true };
const newUser = { signedIn: true, guest: false, onboarded: false };
const user = { signedIn: true, guest: false, onboarded: true };

const decide = (pathname: string, state: Omit<AccessInput, "pathname">) =>
  decideAccess({ pathname, ...state });

describe("decideAccess", () => {
  it("người lạ được đưa về màn Chào mừng, giữ trang định vào", () => {
    expect(decide("/", visitor)).toEqual({ action: "redirect", to: "/welcome" });
    expect(decide("/notebooks", visitor)).toEqual({
      action: "redirect",
      to: "/welcome?next=%2Fnotebooks",
    });
    expect(decide("/onboarding", visitor)).toMatchObject({ action: "redirect" });
  });

  it("ai cũng vào được Chào mừng, Đăng nhập và /auth", () => {
    expect(decide("/welcome", visitor)).toEqual({ action: "allow" });
    expect(decide("/login", visitor)).toEqual({ action: "allow" });
    expect(decide("/auth/confirm", visitor)).toEqual({ action: "allow" });
    expect(decide("/auth/finish", user)).toEqual({ action: "allow" });
    // Trang báo mất mạng: Service Worker lưu sẵn kể cả khi chưa bắt đầu dùng app.
    expect(decide("/offline", visitor)).toEqual({ action: "allow" });
  });

  it("đã đăng nhập thì không quay lại Chào mừng/Đăng nhập", () => {
    expect(decide("/welcome", user)).toEqual({ action: "redirect", to: "/" });
    expect(decide("/login", newUser)).toEqual({ action: "redirect", to: "/" });
  });

  it("khách vẫn mở được Đăng nhập để tạo tài khoản", () => {
    expect(decide("/login", guest)).toEqual({ action: "allow" });
    expect(decide("/welcome", guest)).toEqual({ action: "redirect", to: "/" });
  });

  it("chưa xong onboarding thì vào onboarding trước", () => {
    expect(decide("/", newGuest)).toEqual({ action: "redirect", to: "/onboarding" });
    expect(decide("/stats", newUser)).toEqual({ action: "redirect", to: "/onboarding" });
    expect(decide("/onboarding", newUser)).toEqual({ action: "allow" });
  });

  it("đã xong onboarding thì không mở lại onboarding", () => {
    expect(decide("/onboarding", user)).toEqual({ action: "redirect", to: "/" });
    expect(decide("/", guest)).toEqual({ action: "allow" });
    expect(decide("/settings", user)).toEqual({ action: "allow" });
  });

  it("/admin cần tài khoản, khách bị chuyển sang Đăng nhập", () => {
    expect(decide("/admin", guest)).toEqual({
      action: "redirect",
      to: "/login?next=%2Fadmin",
    });
    expect(decide("/admin/lists", visitor)).toMatchObject({ action: "redirect" });
    expect(decide("/admin", user)).toEqual({ action: "allow" });
  });

  it("không nhầm tiền tố: /administrator, /welcomeback không phải trang đặc biệt", () => {
    expect(decide("/welcomeback", visitor)).toMatchObject({
      action: "redirect",
      to: "/welcome?next=%2Fwelcomeback",
    });
    expect(decide("/administrator", guest)).toEqual({ action: "allow" });
  });
});

describe("safeNextPath", () => {
  it("nhận đường dẫn nội bộ", () => {
    expect(safeNextPath("/notebooks?tab=1")).toBe("/notebooks?tab=1");
  });

  it("chặn chuyển hướng ra ngoài", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null]) {
      expect(safeNextPath(bad)).toBe("/");
    }
    expect(safeNextPath("/a\nb")).toBe("/");
    expect(safeNextPath(undefined, "/onboarding")).toBe("/onboarding");
  });
});
