import { describe, expect, it, vi } from "vitest";
import { BROWSER_CHECK_SCRIPT, UNSUPPORTED_PAGE } from "./browser-support";

/** Chạy script với window/CSS/location giả; trả địa chỉ được chuyển tới (null = ở lại). */
function run({
  layer = true,
  colorMix = true,
  lookbehind = true,
  css = true,
  pathname = "/",
}: {
  layer?: boolean;
  colorMix?: boolean;
  lookbehind?: boolean;
  css?: boolean;
  pathname?: string;
} = {}): string | null {
  const replace = vi.fn();
  const win: Record<string, unknown> = {};
  if (layer) win.CSSLayerBlockRule = function CSSLayerBlockRule() {};
  const CSS = css ? { supports: () => colorMix } : undefined;
  if (CSS) win.CSS = CSS;
  const RegExpImpl = lookbehind
    ? RegExp
    : function () {
        throw new SyntaxError("Invalid regular expression: invalid group specifier name");
      };
  new Function("window", "CSS", "location", "RegExp", BROWSER_CHECK_SCRIPT)(
    win,
    CSS,
    { pathname, replace },
    RegExpImpl,
  );
  return replace.mock.calls[0]?.[0] ?? null;
}

describe("BROWSER_CHECK_SCRIPT", () => {
  it("trình duyệt mới thì ở lại", () => {
    expect(run()).toBeNull();
  });

  it("thiếu bất kỳ dấu hiệu nào thì chuyển sang trang báo trình duyệt cũ", () => {
    expect(run({ layer: false })).toBe(UNSUPPORTED_PAGE);
    expect(run({ colorMix: false })).toBe(UNSUPPORTED_PAGE);
    expect(run({ lookbehind: false })).toBe(UNSUPPORTED_PAGE);
    expect(run({ css: false })).toBe(UNSUPPORTED_PAGE);
  });

  it("đang ở trang báo thì không chuyển nữa (không lặp)", () => {
    expect(run({ layer: false, pathname: UNSUPPORTED_PAGE })).toBeNull();
  });

  it("chỉ dùng cú pháp ES5 (không mũi tên, let/const, chuỗi mẫu)", () => {
    expect(BROWSER_CHECK_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });
});
