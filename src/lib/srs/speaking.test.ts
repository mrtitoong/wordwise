import { describe, expect, it } from "vitest";
import { isPhrase, speakingAllowed, speakingState } from "./speaking";

const TZ = "Asia/Ho_Chi_Minh";
// 12:00 UTC = 19:00 giờ VN, cùng ngày học.
const log = (day: string, correct: boolean, over: { is_extra?: boolean; id?: string } = {}) => ({
  id: over.id ?? `${day}-${correct}-${Math.random()}`,
  reviewed_at: `${day}T12:00:00Z`,
  correct,
  is_extra: over.is_extra ?? false,
});

describe("thẻ Phát âm trong phiên ôn", () => {
  it("cụm nhiều chữ", () => {
    expect(isPhrase("gothic architecture")).toBe(true);
    expect(isPhrase(" gothic ")).toBe(false);
    expect(isPhrase("t-shirt")).toBe(false);
  });

  it("trượt 3 ngày liền → nghỉ 7, trượt tiếp → 14, rồi 30; đọc đạt thì tính lại", () => {
    const fails = ["2026-11-10", "2026-11-11", "2026-11-12"].flatMap((d) => [
      log(d, false),
      log(d, false),
    ]);
    expect(speakingState(fails.slice(0, 4), TZ)).toEqual({
      failDays: 2,
      restUntil: null,
      restDays: null,
    });
    expect(speakingState(fails, TZ)).toEqual({
      failDays: 3,
      restUntil: "2026-11-19",
      restDays: 7,
    });
    const after = [...fails, log("2026-11-19", false)];
    expect(speakingState(after, TZ)).toMatchObject({ restUntil: "2026-12-03", restDays: 14 });
    const more = [...after, log("2026-12-03", false), log("2026-12-30", false)];
    expect(speakingState(more, TZ)).toMatchObject({ restDays: 30 });
    expect(speakingState([...more, log("2027-02-01", true)], TZ).restUntil).toBeNull();
    // Ngày có một lần đạt không phải ngày trượt.
    expect(speakingState([...fails, log("2026-11-12", true)], TZ).failDays).toBe(0);
  });

  it("một câu mỗi ngày học; đang nghỉ thì không vào phiên; lượt tự chọn không tính", () => {
    const fails = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) => log(d, false));
    expect(speakingAllowed(fails.slice(0, 2), "2026-11-11", TZ)).toBe(false);
    expect(speakingAllowed(fails.slice(0, 2), "2026-11-12", TZ)).toBe(true);
    expect(speakingAllowed(fails, "2026-11-18", TZ)).toBe(false);
    expect(speakingAllowed(fails, "2026-11-19", TZ)).toBe(true);
    const free = log("2026-11-13", true, { id: "free" });
    expect(speakingAllowed([free], "2026-11-13", TZ, new Set(["free"]))).toBe(true);
    expect(speakingAllowed([log("2026-11-13", true, { is_extra: true })], "2026-11-13", TZ)).toBe(
      true,
    );
  });
});
