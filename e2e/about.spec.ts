import { expect, test } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

test("trang Giới thiệu: ai cũng vào được, ghi nguồn, tải được giấy phép", async ({
  page,
  request,
}) => {
  await page.goto("/about");
  await expect(page).toHaveURL("/about");
  await expect(page.getByRole("heading", { name: "CC-CEDICT" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Make Me A Hanzi/ })).toBeVisible();
  await expect(page.getByText(/không liên kết/)).toBeVisible();
  await noHorizontalScroll(page);

  for (const path of [
    "/hanzi/ARPHICPL.TXT",
    "/licenses/unicode.txt",
    "/licenses/hanzi-writer.txt",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect((await response.text()).length, path).toBeGreaterThan(500);
  }
});
