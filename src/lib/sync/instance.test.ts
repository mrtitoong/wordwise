import { describe, expect, it } from "vitest";
import { nextInstanceState } from "./instance";

describe("nhiều nơi cùng mở app trên một máy", () => {
  it("nơi đang ẩn tạm nghỉ khi nơi khác được mở lên", () => {
    expect(nextInstanceState("active", { type: "other-active", hidden: true })).toBe("dormant");
  });

  it("nơi đang hiện (hai cửa sổ cạnh nhau) vẫn dùng được", () => {
    expect(nextInstanceState("active", { type: "other-active", hidden: false })).toBe("active");
  });

  it("quay lại nơi đang tạm nghỉ thì chạy lại", () => {
    expect(nextInstanceState("dormant", { type: "visible" })).toBe("active");
    expect(nextInstanceState("dormant", { type: "other-active", hidden: true })).toBe("dormant");
  });
});
