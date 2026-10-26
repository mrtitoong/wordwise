import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  noHorizontalScroll,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "../helpers";

/** Từ mẫu (seed) có trong kho. */
const KNOWN = [
  "affect",
  "bank",
  "biodiversity",
  "borrow",
  "colour",
  "deadline",
  "effect",
  "environment",
  "meet",
  "mitigate",
  "opportunity",
  "resilient",
  "schedule",
  "setback",
  "suggest",
  "sustainable",
  "tenacious",
];
/** Từ chưa có trong kho: nhập thì xếp việc tạo nội dung. */
const FRESH = [
  "abundant",
  "accurate",
  "adapt",
  "advocate",
  "allocate",
  "ambiguous",
  "analyse",
  "anticipate",
  "assess",
  "assume",
  "benefit",
  "capacity",
  "coherent",
  "compile",
  "comprise",
  "concept",
  "conduct",
  "consistent",
  "constitute",
  "context",
  "contrast",
  "contribute",
  "crucial",
  "decline",
  "derive",
  "diminish",
  "distinct",
  "dominant",
  "emerge",
  "enhance",
];
/** 3 dòng lỗi, theo số dòng trong file (dòng 1 là tiêu đề). */
const BAD: Record<number, [string, string]> = {
  6: ["", "thiếu từ"],
  20: ["x".repeat(70), "từ quá dài"],
  40: ["12345", "không phải từ"],
};

/** File 50 dòng (không tính tiêu đề): 17 từ có trong kho, 30 từ mới, 3 dòng lỗi. */
function buildCsv(): string {
  const good = [...KNOWN, ...FRESH];
  const lines = ["word,meaning,tags"];
  for (let line = 2; line <= 51; line++) {
    const bad = BAD[line];
    if (bad) lines.push(`${bad[0]},ghi chú dòng ${line},ielts`);
    else lines.push(`${good.shift()!},,ielts`);
  }
  expect(good).toHaveLength(0);
  return `﻿${lines.join("\r\n")}\r\n`;
}

type SenseRow = {
  id: string;
  meaning_vi: string;
  sense_order: number;
  words: { id: string; lemma: string; pos: string; cefr: string | null };
};

/**
 * generate-word giả lập (CI không chạy Edge Function): "resolve" tra kho thật (từ mẫu), từ khác là
 * chưa có; "request" trả "đang chuẩn bị" như máy chủ vừa xếp việc tạo nội dung.
 */
async function mockGenerateWord(page: Page) {
  const { data, error } = await serverAdmin()!
    .from("word_senses")
    .select("id, meaning_vi, sense_order, words!inner (id, lemma, pos, cefr)")
    .in("words.lemma", KNOWN)
    .order("sense_order");
  if (error) throw new Error(error.message);
  const senses = data as unknown as SenseRow[];
  const requested: string[] = [];
  await page.route("**/functions/v1/generate-word", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === "resolve") {
      const items = (body.lemmas as string[]).map((input) => {
        const rows = senses.filter((s) => s.words.lemma === input);
        const word = rows[0]?.words;
        return {
          input,
          lemma: input,
          alternatives: [],
          words: word
            ? [{ ...word, senses: rows.map((s) => ({ id: s.id, meaning_vi: s.meaning_vi })) }]
            : [],
        };
      });
      return route.fulfill({ json: { items } });
    }
    requested.push(body.lemma as string);
    expect(body.inputMethod).toBe("csv");
    return route.fulfill({
      json: {
        status: "preparing",
        lemma: body.lemma,
        alternatives: [],
        jobId: `job-${body.lemma}`,
      },
    });
  });
  return requested;
}

test.describe("Luồng 4 – nhập CSV có dòng lỗi", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("CSV 50 dòng có 3 dòng lỗi → báo đúng dòng lỗi → nhập 47 từ", async ({ page }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("journey-csv");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    await serverAdmin()!
      .from("profiles")
      .update({ plan: "premium" })
      .eq("user_id", await userIdByEmail(email));
    const requested = await mockGenerateWord(page);

    await page.reload();
    await page.getByRole("tab", { name: "File" }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "journey.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(buildCsv(), "utf8"),
    });
    await expect(page.getByText("50 dòng")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Cột A" })).toHaveValue("word");
    await page.getByRole("button", { name: "Kiểm tra danh sách" }).click();

    // Chỉ hiện dòng lỗi: đúng 3 dòng, đúng số dòng và lý do.
    await page.getByRole("button", { name: "Chỉ hiện dòng lỗi (3)" }).click();
    const rows = page.getByRole("list", { name: "Các dòng trong file" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    for (const [i, [line, [, reason]]] of Object.entries(BAD).entries()) {
      await expect(rows.nth(i)).toContainText(line);
      await expect(rows.nth(i)).toContainText(reason);
    }
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Hiện tất cả" }).click();
    await expect(rows).toHaveCount(50);

    await expect(page.getByText("47 từ sẽ thêm")).toBeVisible();
    await expect(
      page.getByText("17 từ có trong kho · 30 từ mới cần tạo nội dung · 3 bỏ qua (lỗi, trùng)"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Thêm 47 từ" }).click();

    await expect(page.getByText("Đã nhập xong “journey.csv”")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("17 từ đã thêm, 30 từ đang tạo nội dung, 3 bỏ qua.")).toBeVisible();
    expect(requested.sort()).toEqual([...FRESH].sort());

    // 17 từ có trong kho vào "Sổ của tôi" với tag của file, cách nhập "csv".
    const entries = await readLocalStore<{ input_method: string; tags: string[] }>(
      page,
      "notebook_entries",
    );
    expect(entries).toHaveLength(17);
    expect(entries.every((e) => e.input_method === "csv" && e.tags.includes("ielts"))).toBe(true);
  });
});
