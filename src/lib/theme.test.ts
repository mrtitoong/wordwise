import { describe, expect, it } from "vitest";
import { THEME_SCRIPT, isDark, parseTheme, themeCookie } from "./theme";

describe("giao diện sáng/tối", () => {
  it("giá trị lạ hoặc chưa chọn thì theo máy", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("theo máy thì tối khi máy tối; Sáng/Tối thì bỏ qua máy", () => {
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });

  it("cookie lưu một năm cho cả trang", () => {
    expect(themeCookie("dark")).toBe("ww_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("script trong <head> áp đúng lớp theo cookie và chế độ của máy", () => {
    const run = (cookie: string, systemDark: boolean) => {
      const classes = new Set<string>();
      const root = {
        classList: {
          toggle: (name: string, on: boolean) =>
            void (on ? classes.add(name) : classes.delete(name)),
        },
        style: { colorScheme: "" },
      };
      const fn = new Function("document", "matchMedia", THEME_SCRIPT);
      fn({ cookie, documentElement: root }, () => ({
        matches: systemDark,
        addEventListener: () => undefined,
      }));
      return { dark: classes.has("dark"), scheme: root.style.colorScheme };
    };
    expect(run("", true)).toEqual({ dark: true, scheme: "dark" });
    expect(run("a=1; ww_theme=light", true)).toEqual({ dark: false, scheme: "light" });
    expect(run("ww_theme=dark", false)).toEqual({ dark: true, scheme: "dark" });
    expect(run("ww_theme=system", false)).toEqual({ dark: false, scheme: "light" });
  });
});
