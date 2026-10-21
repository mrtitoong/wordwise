import { describe, expect, it } from "vitest";
import { fitWithin, toUserImageRef, userImagePath, userImagePathFromRef } from "./user-images";

const USER = "11111111-1111-4111-8111-111111111111";

describe("ảnh tự tải lên", () => {
  it("tham chiếu đi và về", () => {
    const path = userImagePath(USER, "abc", "webp");
    expect(path).toBe(`${USER}/abc.webp`);
    const ref = toUserImageRef(path);
    expect(ref).toBe(`storage://user-images/${USER}/abc.webp`);
    expect(userImagePathFromRef(ref, USER)).toBe(path);
  });

  it("không nhận tham chiếu của người khác, URL ngoài hoặc ../", () => {
    const other = toUserImageRef(userImagePath("22222222-2222-4222-8222-222222222222", "a", "jpg"));
    expect(userImagePathFromRef(other, USER)).toBeNull();
    expect(userImagePathFromRef("https://x.test/a.jpg", USER)).toBeNull();
    expect(userImagePathFromRef(`storage://user-images/${USER}/../x.jpg`, USER)).toBeNull();
    expect(userImagePathFromRef(null, USER)).toBeNull();
  });

  it("thu nhỏ giữ tỉ lệ, không phóng to", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1000, 2000)).toEqual({ width: 400, height: 800 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
});
