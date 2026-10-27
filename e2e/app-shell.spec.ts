import { expect, test } from "@playwright/test";
import { asOnboardedGuest } from "./helpers";

test.beforeEach(async ({ context, baseURL }) => {
  await asOnboardedGuest(context, baseURL);
});

const tabs = [
  { name: "Hôm nay", path: "/" },
  { name: "Từ của tôi", path: "/notebooks" },
  { name: "Luyện tập", path: "/practice" },
  { name: "Thống kê", path: "/stats" },
];

test.describe("Khung ứng dụng ở 360px", () => {
  test("chuyển được giữa 4 tab của thanh điều hướng dưới", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Điều hướng chính" });

    for (const tab of tabs) {
      await nav.getByRole("link", { name: tab.name }).click();
      await expect(page).toHaveURL(tab.path);
      await expect(nav.getByRole("link", { name: tab.name })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("không cuộn ngang và vùng chạm ≥ 44px", async ({ page }) => {
    for (const { path } of tabs) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `cuộn ngang ở ${path}`).toBeLessThanOrEqual(0);
    }

    await page.goto("/");
    const targets = page.locator("nav a, a[aria-label], button");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      expect(box, `phần tử ${i} không hiển thị`).not.toBeNull();
      expect(box!.height, `phần tử ${i} thấp hơn 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `phần tử ${i} hẹp hơn 44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test("thanh trên: logo + WordWise ở Hôm nay, logo cạnh tiêu đề ở các tab, trang con không có logo", async ({
    page,
  }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("WordWise");
    await expect(heading.locator("svg")).toBeVisible();
    for (const { path, title } of [
      { path: "/notebooks", title: "Từ của tôi" },
      { path: "/stats", title: "Thống kê" },
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 }).locator("svg")).toBeVisible();
    }
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1 }).locator("svg")).toHaveCount(0);
  });

  test("nút + Thêm từ mở màn Thêm từ", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Thêm từ", exact: true }).click();
    await expect(page).toHaveURL("/add");
    await expect(page.getByRole("heading", { level: 1, name: "Thêm từ" })).toBeVisible();
  });
});

test.describe("Ngôn ngữ giao diện", () => {
  test("đổi sang tiếng Anh trong Cài đặt, giữ khi tải lại", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Cài đặt" })).toBeVisible();

    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

    await page.goto("/settings");
    await page.getByRole("radio", { name: "Tiếng Việt" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Cài đặt" })).toBeVisible();
  });

  test("trình duyệt tiếng Anh lần đầu thấy giao diện tiếng Anh", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Try it now" })).toBeVisible();
    await context.close();
  });
});
