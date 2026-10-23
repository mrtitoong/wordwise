import { expect, test } from "@playwright/test";
import { asOnboardedGuest, readLocalStore } from "./helpers";

type Settings = { desired_retention: number };

test.describe("Cài đặt học tập", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await asOnboardedGuest(context, baseURL);
  });

  test("tỉ lệ nhớ: xem ước tính số thẻ/ngày trước khi lưu", async ({ page }) => {
    await page.goto("/settings");
    const group = page.getByRole("radiogroup", { name: "Tỉ lệ nhớ mong muốn" });
    await expect(group.getByRole("radio", { name: "90%" })).toHaveAttribute("aria-checked", "true");
    const status = page.getByRole("status").filter({ hasText: "thẻ ôn mỗi ngày" });
    await expect(status).toContainText(/Khoảng \d+ thẻ ôn mỗi ngày/);

    await group.getByRole("radio", { name: "95%" }).click();
    await expect(status).toContainText("(Mức 90% hiện tại");
    await page.getByRole("button", { name: "Lưu 95%" }).click();
    await expect(page.getByRole("button", { name: "Lưu 95%" })).toBeHidden();
    await expect
      .poll(
        async () => (await readLocalStore<Settings>(page, "user_settings"))[0]?.desired_retention,
      )
      .toBe(0.95);
  });

  test("nhắc học cần đăng nhập", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Đăng nhập để nhận nhắc học")).toBeVisible();
  });
});
