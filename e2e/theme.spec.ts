import { expect, test } from "@playwright/test";
import { asOnboardedGuest } from "./helpers";

const html = (page: import("@playwright/test").Page) => page.locator("html");

test.describe("Giao diện sáng/tối", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await asOnboardedGuest(context, baseURL);
  });

  test("mặc định theo máy: máy để tối thì app tối, máy sáng thì app sáng", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });

  test("chọn Tối trong Cài đặt: đổi ngay, giữ khi tải lại, máy chủ trả trang đã tối (không nháy)", async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    const group = page.getByRole("radiogroup", { name: "Giao diện" });
    await expect(group.getByRole("radio", { name: "Theo máy" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Phím mũi tên chuyển và chọn như mọi nhóm lựa chọn.
    await group.getByRole("radio", { name: "Theo máy" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: "Sáng" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(group.getByRole("radio", { name: "Sáng" })).toBeFocused();
    await group.getByRole("radio", { name: "Tối" }).click();
    await expect(html(page)).toHaveClass(/\bdark\b/);

    await page.reload();
    await expect(html(page)).toHaveClass(/\bdark\b/);
    await expect(group.getByRole("radio", { name: "Tối" })).toHaveAttribute("aria-checked", "true");

    const cookies = await page.context().cookies();
    const raw = await request.get("/", {
      headers: { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    expect(await raw.text()).toMatch(/<html[^>]*class="[^"]*\bdark\b/);

    await group.getByRole("radio", { name: "Sáng" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
  });
});
