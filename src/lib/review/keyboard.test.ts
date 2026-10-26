import { describe, expect, it } from "vitest";
import { LETTER_ROWS, MAX_ANSWER_LENGTH, applyKey, keyFromKeyboardEvent } from "./keyboard";

const char = (c: string) => ({ kind: "char", char: c }) as const;

describe("bàn phím chữ cái", () => {
  it("đủ 26 chữ cái, không trùng", () => {
    const letters = LETTER_ROWS.flat();
    expect(letters).toHaveLength(26);
    expect(new Set(letters).size).toBe(26);
  });

  it("applyKey: thêm chữ, xóa, bỏ dấu cách thừa, giới hạn độ dài", () => {
    expect(applyKey("alleg", char("e"))).toBe("allege");
    expect(applyKey("allege", { kind: "backspace" })).toBe("alleg");
    expect(applyKey("", { kind: "backspace" })).toBe("");
    expect(applyKey("", char(" "))).toBe("");
    expect(applyKey("give", char(" "))).toBe("give ");
    expect(applyKey("give ", char(" "))).toBe("give ");
    expect(applyKey("give up", { kind: "submit" })).toBe("give up");
    const long = "a".repeat(MAX_ANSWER_LENGTH);
    expect(applyKey(long, char("b"))).toBe(long);
  });

  it("phím vật lý: chữ cái (cả hoa), xóa, Enter, ký tự phụ; bỏ phím tắt và phím khác", () => {
    expect(keyFromKeyboardEvent({ key: "A" })).toEqual(char("a"));
    expect(keyFromKeyboardEvent({ key: "-" })).toEqual(char("-"));
    expect(keyFromKeyboardEvent({ key: " " })).toEqual(char(" "));
    expect(keyFromKeyboardEvent({ key: "Backspace" })).toEqual({ kind: "backspace" });
    expect(keyFromKeyboardEvent({ key: "Enter" })).toEqual({ kind: "submit" });
    expect(keyFromKeyboardEvent({ key: "a", ctrlKey: true })).toBeNull();
    expect(keyFromKeyboardEvent({ key: "ê" })).toBeNull();
    expect(keyFromKeyboardEvent({ key: "1" })).toBeNull();
    expect(keyFromKeyboardEvent({ key: "Shift" })).toBeNull();
  });
});
