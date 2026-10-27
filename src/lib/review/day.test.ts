import { describe, expect, it } from "vitest";
import { studyDay, studyDayEnd } from "./day";

const VN = "Asia/Ho_Chi_Minh";

describe("studyDayEnd", () => {
  it("21:00 giờ Việt Nam → hết ngày học lúc 4:00 sáng mai", () => {
    expect(studyDayEnd(new Date("2026-10-27T14:00:00Z"), VN).toISOString()).toBe(
      "2026-10-27T21:00:00.000Z",
    );
  });

  it("2:00 sáng vẫn là ngày học hôm trước → hết lúc 4:00 cùng buổi sáng", () => {
    const now = new Date("2026-10-27T19:00:00Z"); // 2:00 ngày 28 giờ VN
    expect(studyDay(now, VN)).toBe("2026-10-27");
    expect(studyDayEnd(now, VN).toISOString()).toBe("2026-10-27T21:00:00.000Z");
  });

  it("đúng 4:00 là ngày học mới", () => {
    expect(studyDayEnd(new Date("2026-10-27T21:00:00Z"), VN).toISOString()).toBe(
      "2026-10-28T21:00:00.000Z",
    );
  });

  it("theo giờ mùa đông khi ngày học mai đã đổi giờ (New York, 1/11/2026)", () => {
    // 12:00 EDT (UTC−4) ngày 31/10; 4:00 ngày 1/11 đã là EST (UTC−5).
    expect(studyDayEnd(new Date("2026-10-31T16:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
  });

  it("múi giờ sai thì dùng giờ Việt Nam", () => {
    expect(studyDayEnd(new Date("2026-10-27T14:00:00Z"), "Not/AZone").toISOString()).toBe(
      "2026-10-27T21:00:00.000Z",
    );
  });
});
