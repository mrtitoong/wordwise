import { describe, expect, it } from "vitest";
import { isActive } from "./nav-items";

describe("isActive", () => {
  it("tab Hôm nay chỉ sáng ở trang chủ", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/notebooks")).toBe(false);
  });

  it("tab khác sáng cả ở trang con", () => {
    expect(isActive("/notebooks", "/notebooks")).toBe(true);
    expect(isActive("/notebooks", "/notebooks/abc")).toBe(true);
  });

  it("không nhầm tiền tố giống nhau", () => {
    expect(isActive("/stats", "/statsx")).toBe(false);
  });
});
