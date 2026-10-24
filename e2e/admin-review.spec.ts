import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
} from "./helpers";

/** Từ mẫu (seed) dùng riêng cho test này: bank có 2 nghĩa để thử đổi nghĩa. */
const WORDS = ["bank", "mitigate", "biodiversity"] as const;

type SenseRow = { id: string; sense_order: number; meaning_vi: string; words: { lemma: string } };

async function senses() {
  const { data, error } = await serverAdmin()!
    .from("word_senses")
    .select("id, sense_order, meaning_vi, word_id, words!inner (lemma)")
    .in("words.lemma", [...WORDS])
    .order("sense_order");
  if (error) throw new Error(error.message);
  return data as unknown as (SenseRow & { word_id: string })[];
}

/** Danh sách ở trạng thái Chờ duyệt (như vừa phân tích xong): bank có cảnh báo, 2 từ còn lại không. */
async function seedList(title: string) {
  const admin = serverAdmin()!;
  const rows = await senses();
  const first = (lemma: string) =>
    rows.find((s) => s.words.lemma === lemma && s.sense_order === 0)!;
  const { data: list, error } = await admin
    .from("curated_lists")
    .insert({ title, language: "en", status: "review", target_cefr: "B1" })
    .select("id")
    .single();
  if (error || !list) throw new Error(error?.message);
  const items = WORDS.map((lemma, i) => ({
    list_id: list.id,
    sense_id: first(lemma).id,
    item_order: i,
    warnings: lemma === "bank" ? [{ code: "no_context" }] : [],
  }));
  const inserted = await admin.from("curated_list_items").insert(items);
  if (inserted.error) throw new Error(inserted.error.message);
  return { listId: list.id as string, rows };
}

async function openAsAdmin(page: Page, path: string) {
  await signInWithCode(page, "admin@wordwise.local", path);
  await page.waitForURL(/\/(onboarding|admin)/);
  await page.goto(path);
}

test.describe("Admin duyệt và xuất bản danh sách", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("chấp nhận hàng loạt → đổi nghĩa → xuất bản v1 → mở bản nháp", async ({ page }) => {
    test.setTimeout(90_000);
    const { listId, rows } = await seedList(`Duyệt E2E ${Date.now()}`);
    await openAsAdmin(page, `/admin/lists/${listId}/review`);

    await expect(page.getByRole("heading", { level: 1, name: "Duyệt danh sách" })).toBeVisible();
    await expect(page.getByText("Đã duyệt 0/3 từ")).toBeVisible();
    await expect(page.getByTestId("review-row")).toHaveCount(3);
    const publish = page.getByRole("button", { name: "Xuất bản", exact: true });
    await expect(publish).toBeDisabled();

    await page.getByRole("button", { name: "Chỉ từ có cảnh báo" }).click();
    await expect(page.getByTestId("review-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Chỉ từ có cảnh báo" }).click();

    await page.getByRole("button", { name: /Chấp nhận tất cả từ không có cảnh báo \(2\)/ }).click();
    await expect(page.getByText("Đã duyệt 2/3 từ")).toBeVisible();

    // Mở bank: đổi sang nghĩa "bờ sông" rồi chấp nhận.
    await page.getByRole("button", { name: /^bank/ }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Nghĩa dùng trong danh sách")).toBeVisible();
    await panel.getByRole("radio", { name: /bờ \(sông, hồ\)/ }).check();
    await expect(panel.getByText("Không có ngữ cảnh")).toHaveCount(0);
    await panel.getByRole("button", { name: "Chấp nhận", exact: true }).click();
    await panel.getByRole("button", { name: "Đóng" }).click();
    await expect(page.getByText("Đã duyệt 3/3 từ")).toBeVisible();

    await publish.click();
    await expect(page.getByText("Đã xuất bản phiên bản 1.")).toBeVisible();
    await expect(page.getByText("Đã xuất bản v1")).toBeVisible();

    const admin = serverAdmin()!;
    const { data: release } = await admin
      .from("curated_list_release_items")
      .select("sense_id")
      .eq("list_id", listId)
      .eq("version", 1);
    const bankShore = rows.find((s) => s.words.lemma === "bank" && s.sense_order === 1)!;
    expect(release?.map((r) => r.sense_id)).toContain(bankShore.id);

    await page.getByRole("button", { name: "Sửa danh sách" }).click();
    await expect(page.getByText(/Đã mở bản nháp/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hủy bản nháp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xuất bản phiên bản mới" })).toBeEnabled();
  });

  test("Duyệt tất: cả từ có cảnh báo, theo bộ lọc, Hoàn tác được", async ({ page }) => {
    test.setTimeout(90_000);
    const { listId } = await seedList(`Duyệt tất E2E ${Date.now()}`);
    await openAsAdmin(page, `/admin/lists/${listId}/review`);
    await expect(page.getByText("Đã duyệt 0/3 từ")).toBeVisible();

    // Có lọc: chỉ duyệt các từ đang hiện (bank, có cảnh báo).
    await page.getByRole("button", { name: "Chỉ từ có cảnh báo" }).click();
    await page.getByRole("button", { name: "Duyệt tất các từ đang hiện (1)" }).click();
    await expect(page.getByText("Đã duyệt 1/3 từ")).toBeVisible();
    await page.getByRole("button", { name: "Chỉ từ có cảnh báo" }).click();

    await page.getByRole("button", { name: "Duyệt tất (2)" }).click();
    await expect(page.getByText("Đã duyệt 3/3 từ")).toBeVisible();
    const publish = page.getByRole("button", { name: "Xuất bản", exact: true });
    await expect(publish).toBeEnabled();

    // Hoàn tác chỉ gỡ lượt vừa duyệt (2 từ), bank vẫn giữ.
    await page.getByRole("button", { name: "Hoàn tác" }).click();
    await expect(page.getByText("Đã duyệt 1/3 từ")).toBeVisible();
    await expect(publish).toBeDisabled();
    await expect
      .poll(async () => {
        const { data } = await serverAdmin()!
          .from("curated_list_items")
          .select("accepted")
          .eq("list_id", listId)
          .eq("accepted", true);
        return data?.length;
      })
      .toBe(1);
  });

  test("sửa nội dung từ dùng chung: lưu vào kho và đánh dấu đã duyệt", async ({ page }) => {
    test.setTimeout(90_000);
    const { listId, rows } = await seedList(`Sửa từ E2E ${Date.now()}`);
    const mitigate = rows.find((s) => s.words.lemma === "mitigate")!;
    const admin = serverAdmin()!;
    try {
      await openAsAdmin(page, `/admin/lists/${listId}/review`);
      await page.getByRole("button", { name: /^mitigate/ }).click();
      const panel = page.getByRole("dialog");
      await panel.getByRole("button", { name: "Sửa nội dung" }).click();
      await expect(panel.getByText(/Nội dung này dùng chung/)).toBeVisible();
      const meaning = panel.getByRole("textbox", { name: "Nghĩa tiếng Việt" });
      await meaning.fill("");
      await panel.getByRole("button", { name: "Lưu vào kho" }).click();
      await expect(panel.getByRole("alert")).toContainText("Chưa lưu được");

      await meaning.fill("giảm nhẹ (E2E)");
      await panel.getByRole("button", { name: "Lưu vào kho" }).click();
      await expect(page.getByText("Đã lưu nội dung từ.")).toBeVisible();
      await expect(page.getByTestId("review-row").filter({ hasText: "mitigate" })).toContainText(
        "giảm nhẹ (E2E)",
      );

      const { data: word } = await admin
        .from("words")
        .select("reviewed, content_updated_at")
        .eq("id", mitigate.word_id)
        .single();
      expect(word?.reviewed).toBe(true);
      expect(word?.content_updated_at).not.toBeNull();
    } finally {
      await admin
        .from("word_senses")
        .update({ meaning_vi: mitigate.meaning_vi })
        .eq("id", mitigate.id);
    }
  });

  test("người dùng thường không mở được màn duyệt và thống kê (404)", async ({ page }) => {
    const { listId } = await seedList(`Chặn E2E ${Date.now()}`);
    await signInWithCode(page, uniqueEmail("plain-review"));
    await completeOnboarding(page);
    for (const path of [`/admin/lists/${listId}/review`, `/admin/lists/${listId}/stats`]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });
});
