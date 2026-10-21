import { describe, expect, it } from "vitest";
import { sendContentReport } from "./report";

const WORD = "88888888-0000-4000-8000-0000000000a1";

function fakeClient(result: { error: { message: string } | null } | Error) {
  const inserted: unknown[] = [];
  return {
    inserted,
    client: {
      from: () => ({
        insert: async (row: unknown) => {
          inserted.push(row);
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    } as never,
  };
}

const base = { wordId: WORD, senseId: null, layer: "meaning", reason: "other" } as const;

describe("sendContentReport", () => {
  it("gửi đúng cột, ghi chú rỗng thành null", async () => {
    const fake = fakeClient({ error: null });
    const result = await sendContentReport(fake.client, {
      ...base,
      layer: "memory",
      reason: "incorrect",
      note: "   ",
    });
    expect(result).toEqual({ ok: true });
    expect(fake.inserted).toEqual([
      { word_id: WORD, sense_id: null, layer: "memory", reason: "incorrect", note: null },
    ]);
  });

  it("quá giới hạn ngày", async () => {
    const fake = fakeClient({ error: { message: "report_limit_reached" } });
    expect(await sendContentReport(fake.client, base)).toEqual({ ok: false, error: "limit" });
  });

  it("mất mạng và lỗi khác", async () => {
    const offline = fakeClient(new TypeError("Failed to fetch"));
    expect(await sendContentReport(offline.client, base)).toEqual({ ok: false, error: "network" });
    const failed = fakeClient({ error: { message: "permission denied" } });
    expect(await sendContentReport(failed.client, base)).toEqual({ ok: false, error: "failed" });
  });

  it("dữ liệu sai bị chặn trước khi gửi", async () => {
    const fake = fakeClient({ error: null });
    await expect(
      sendContentReport(fake.client, { ...base, wordId: "khong-phai-uuid" }),
    ).rejects.toThrow();
    expect(fake.inserted).toEqual([]);
  });
});
