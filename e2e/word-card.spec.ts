import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";

/** Mở từ đầu tiên trong "Sổ của tôi". */
async function openFirstWord(page: Page) {
  await page.goto("/notebooks");
  await page.getByRole("link", { name: /Sổ của tôi/ }).click();
  const list = page.getByRole("list", { name: "Sổ của tôi" });
  await expect(list.getByRole("link")).toHaveCount(5);
  await list.getByRole("link").first().click();
}

/** Khách học 5 từ khởi đầu rồi mở thẻ của từ đầu tiên trong "Từ của tôi". */
async function openFirstWordAsGuest(page: Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Dùng thử ngay" }).click();
  await completeOnboarding(page, { level: "B1" });
  await expect(page).toHaveURL("/");
  await openFirstWord(page);
  await expect(page).toHaveURL(/\/words\/[0-9a-f-]{36}$/);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  return (await heading.innerText()).trim();
}

test.describe("Thẻ từ", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("5 tab, Xem nhanh, 360px không cuộn ngang, vùng chạm ≥ 44px", async ({ page }) => {
    await openFirstWordAsGuest(page);
    const tabs = page.getByRole("tablist", { name: "Nội dung thẻ từ" });
    await expect(tabs.getByRole("tab", { name: "Nghĩa" })).toHaveAttribute("aria-selected", "true");
    await expect(tabs.getByRole("tab", { name: "Ví dụ" })).toBeVisible();
    await expect(page.getByText("Trong sổ:")).toBeVisible();

    await tabs.getByRole("tab", { name: "Ví dụ" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.locator("strong").first()).toBeVisible();
    await panel.getByRole("button", { name: "Hiện bản dịch" }).first().click();
    await expect(panel.getByRole("button", { name: "Ẩn bản dịch" }).first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const buttons = page.locator("main button:visible, main [role=tab]:visible");
    for (let i = 0; i < (await buttons.count()); i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box!.height, `nút ${i} thấp hơn 44px`).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole("radio", { name: "Xem nhanh" }).click();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("radio", { name: "Xem nhanh" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "Đầy đủ" }).click();
    await expect(page.getByRole("tablist")).toBeVisible();
  });

  test("thêm, sửa, xóa câu của bạn; đổi nghĩa hiển thị và dùng lại bản gốc", async ({ page }) => {
    const lemma = await openFirstWordAsGuest(page);
    await page.getByRole("tab", { name: "Ví dụ" }).click();

    await page.getByRole("button", { name: "Thêm câu của bạn" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Thêm câu ví dụ của bạn" });
    await sheet.getByLabel("Câu ví dụ").fill("Nothing to see here.");
    await expect(sheet.getByText(`Câu nên chứa “${lemma}”`)).toBeVisible();
    await sheet.getByLabel("Câu ví dụ").fill(`I wrote ${lemma} in my notebook.`);
    await expect(sheet.getByText(`Câu nên chứa “${lemma}”`)).toHaveCount(0);
    await sheet.getByLabel("Bản dịch (tùy chọn)").fill("Câu thử.");
    await sheet.getByRole("button", { name: "Lưu" }).click();
    await expect(sheet).toHaveCount(0);

    const mine = page.locator("[data-mine]");
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText("Của bạn");
    await expect(mine).toContainText(`I wrote ${lemma} in my notebook.`);

    // Lưu trong máy: tải lại vẫn còn.
    await page.reload();
    await page.getByRole("tab", { name: "Ví dụ" }).click();
    await expect(page.locator("[data-mine]")).toContainText("Câu thử.");

    await page.locator("[data-mine]").getByRole("button", { name: "Sửa" }).click();
    const edit = page.getByRole("dialog", { name: "Sửa nội dung của bạn" });
    await edit.getByLabel("Câu ví dụ").fill(`My ${lemma} sentence.`);
    await edit.getByRole("button", { name: "Lưu" }).click();
    await expect(page.locator("[data-mine]")).toContainText(`My ${lemma} sentence.`);
    await page.locator("[data-mine]").getByRole("button", { name: "Sửa" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xóa" }).click();
    await expect(page.locator("[data-mine]")).toHaveCount(0);

    await page.getByRole("tab", { name: "Nghĩa" }).click();
    await page.getByRole("button", { name: "Đổi nghĩa hiển thị" }).first().click();
    const meaning = page.getByRole("dialog", { name: "Đổi nghĩa hiển thị" });
    await meaning.getByLabel("Nghĩa bạn muốn thấy").fill("nghĩa của riêng tôi");
    await meaning.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText("nghĩa của riêng tôi")).toBeVisible();
    await expect(page.getByText(/^Bản gốc: /)).toBeVisible();
    await page.getByRole("button", { name: "Đổi nghĩa hiển thị" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Dùng lại bản gốc" }).click();
    await expect(page.getByText("nghĩa của riêng tôi")).toHaveCount(0);
  });

  test("khách bấm Báo lỗi được mời đăng nhập", async ({ page }) => {
    await openFirstWordAsGuest(page);
    await page.getByRole("button", { name: "Báo lỗi" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Báo lỗi nội dung" });
    await expect(sheet.getByText("Cần đăng nhập để gửi báo lỗi.")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  });

  test("người đã đăng nhập gửi báo lỗi, server nhận", async ({ page }) => {
    const email = uniqueEmail("report");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");
    await openFirstWord(page);
    await expect(page.getByRole("tablist")).toBeVisible();

    await page.getByRole("button", { name: "Báo lỗi" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Báo lỗi nội dung" });
    await sheet.getByRole("radio", { name: "Dịch chưa đúng" }).check();
    await sheet.getByLabel("Mô tả thêm (tùy chọn)").fill("Nghĩa tiếng Việt chưa sát");
    await sheet.getByRole("button", { name: "Gửi báo lỗi" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã gửi báo lỗi" })).toBeVisible();

    const admin = serverAdmin();
    test.skip(!admin, "cần E2E_SUPABASE_SECRET_KEY để kiểm tra dữ liệu trên server");
    const userId = await userIdByEmail(email);
    const { data } = await admin!
      .from("content_reports")
      .select("layer, reason, note, status")
      .eq("user_id", userId);
    expect(data).toEqual([
      {
        layer: "meaning",
        reason: "translation",
        note: "Nghĩa tiếng Việt chưa sát",
        status: "open",
      },
    ]);
  });
});
