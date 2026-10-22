import { expect, test } from "@playwright/test";
import { asOnboardedGuest } from "./helpers";

// Micro giả của Chromium (phát tiếng bíp liên tục), tự cho phép quyền micro.
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

test.beforeEach(async ({ context, baseURL }) => {
  await asOnboardedGuest(context, baseURL);
});

test.describe("Thu âm (Kiểm tra micro)", () => {
  test("giải thích trước khi xin quyền, thu tối đa 5 giây, nghe lại, đổi được sang WAV", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("link", { name: "Kiểm tra micro" }).click();
    await expect(page).toHaveURL("/settings/microphone");

    await page.getByRole("button", { name: "Bắt đầu thu" }).click();
    // Lần đầu: giải thích vì sao cần micro.
    await expect(page.getByRole("dialog", { name: "Cho phép dùng micro" })).toBeVisible();
    await page.getByRole("button", { name: "Cho phép micro" }).click();
    await expect(page.getByText("Đang thu… nói đi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dừng thu" })).toBeVisible();

    // Tự dừng (im lặng hoặc hết 5 giây).
    await expect(page.getByRole("heading", { name: "Bản thu" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/^audio\//)).toBeVisible();
    const seconds = Number(
      (await page.getByText(/giây$/).first().textContent())!.replace(/[^\d.]/g, ""),
    );
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(5.5);

    await page.getByRole("button", { name: "Thử đổi sang WAV" }).click();
    await expect(page.getByText(/^Được \(\d+ KB\)$|^Quá nhỏ, như im lặng$/)).toBeVisible();

    // Lần sau không hỏi lại; bấm Dừng thì dừng ngay.
    await page.getByRole("button", { name: "Thu lại" }).click();
    await page.getByRole("button", { name: "Bắt đầu thu" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "Dừng thu" }).click();
    await expect(page.getByRole("heading", { name: "Bản thu" })).toBeVisible();
  });
});
