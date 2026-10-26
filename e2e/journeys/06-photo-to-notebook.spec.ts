import { expect, test } from "@playwright/test";
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
import { mockPhotoFunctions } from "../mocks";

type Entry = { notebook_id: string; input_method: string; context_sentence: string | null };

test.describe("Luồng 6 – thêm từ bằng ảnh vào sổ tay", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("Premium: tạo sổ → chụp ảnh mẫu (OCR giả lập) → chọn từ → vào đúng sổ, lên máy chủ", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("journey-photo");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    const userId = await userIdByEmail(email);
    await serverAdmin()!.from("profiles").update({ plan: "premium" }).eq("user_id", userId);
    const requests = await mockPhotoFunctions(page);

    // Sổ đích riêng cho bài đọc.
    await page.goto("/notebooks");
    await page.getByRole("button", { name: "Sổ tay mới" }).click();
    const sheet = page.getByRole("dialog", { name: "Sổ tay mới" });
    await sheet.getByLabel("Tên sổ").fill("Bài đọc");
    await sheet.getByRole("button", { name: "Tạo sổ tay" }).click();
    await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);
    const notebookId = page.url().split("/").pop()!;
    await page.getByRole("link", { name: "Thêm từ vào sổ này" }).click();
    await expect(page).toHaveURL(/\/add\?notebook=/);

    await page.getByRole("tab", { name: "Ảnh" }).click();
    await page.getByTestId("photo-file").setInputFiles("tests/fixtures/ocr/print-clear.jpg");
    await page.getByRole("button", { name: "Đọc chữ" }).click();
    await expect(page.getByLabel("Ảnh đã đọc chữ, chạm vào từ để chọn")).toBeVisible();
    await noHorizontalScroll(page);

    await page.getByRole("button", { name: "Tự chọn từ mới" }).click();
    const chips = page.getByRole("list", { name: "Các từ đã chọn" }).getByRole("button");
    await expect(chips).toHaveText(["resilient", "setbacks", "tenacous", "persevere"]);
    await page.getByRole("button", { name: "Tiếp: kiểm tra 4 từ" }).click();
    await page.getByRole("button", { name: /Có phải tenacious\?/ }).click();
    await page.getByRole("button", { name: "Thêm 4 từ" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thêm 3 từ. 1 từ đang chuẩn bị nội dung." }),
    ).toBeVisible();
    // Từ chưa có trong kho xếp việc tạo nội dung vào đúng sổ, kèm câu gốc.
    expect(requests.find((r) => r.action === "request")).toMatchObject({
      lemma: "persevere",
      notebookId,
      inputMethod: "photo",
    });

    // Sổ "Bài đọc" có 3 từ, mỗi từ giữ câu gốc trên ảnh.
    const entries = (await readLocalStore<Entry>(page, "notebook_entries")).filter(
      (e) => e.notebook_id === notebookId,
    );
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.input_method === "photo" && !!e.context_sentence)).toBe(true);
    await page.goto(`/notebooks/${notebookId}`);
    const list = page.getByRole("list", { name: "Bài đọc" });
    for (const lemma of ["resilient", "setback", "tenacious"]) {
      await expect(list.getByRole("link", { name: new RegExp(lemma) })).toBeVisible();
    }

    // Đồng bộ lên máy chủ.
    await expect
      .poll(
        async () => {
          const { data } = await serverAdmin()!
            .from("notebook_entries")
            .select("input_method")
            .eq("user_id", userId)
            .eq("notebook_id", notebookId);
          return data?.length;
        },
        { timeout: 15_000 },
      )
      .toBe(3);
  });
});
