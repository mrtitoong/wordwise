import { expect, test, type Page } from "@playwright/test";

/** Giả lập trang bị ẩn/hiện (Playwright luôn coi mọi trang là đang hiện). */
async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("app cài + tab trình duyệt cùng mở: nơi đang ẩn tạm nghỉ, quay lại thì chạy lại", async ({
  context,
}) => {
  const background = await context.newPage();
  await background.goto("/offline");
  const content = background.getByRole("heading").first();
  await expect(content).toBeVisible();
  await setVisibility(background, "hidden");

  // Nơi khác được mở lên dùng.
  const foreground = await context.newPage();
  await foreground.goto("/offline");
  await expect(foreground.getByRole("heading").first()).toBeVisible();

  const notice = background.getByRole("status").filter({ hasText: "cửa sổ khác" });
  await expect(notice).toBeVisible();
  await expect(content).toBeHidden();

  // Nơi đang dùng không bị ảnh hưởng.
  await expect(foreground.getByText("cửa sổ khác")).toHaveCount(0);

  // Quay lại nơi tạm nghỉ: chạy lại.
  await setVisibility(background, "visible");
  await expect(notice).toBeHidden();
  await expect(content).toBeVisible();
});
