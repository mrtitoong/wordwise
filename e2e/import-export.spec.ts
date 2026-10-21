import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";

test.describe("Nhập file và xuất CSV", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("khách: tab File mời đăng nhập; xuất sổ ra CSV", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1" });
    await expect(page).toHaveURL("/");

    await page.goto("/add");
    await page.getByRole("tab", { name: "File" }).click();
    await expect(page.getByText("Đăng nhập để nhập từ file.")).toBeVisible();

    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    await expect(page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link")).toHaveCount(5);
    await page.getByRole("button", { name: "Tùy chọn sổ" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Sổ của tôi \d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile((await file.path())!, "utf8");
    expect(csv.startsWith("\uFEFFword,pos,meaning,example,note,tags,status,added_at")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(6);
  });

  test("gói Free thấy giới thiệu Premium; Premium chọn file và ánh xạ cột", async ({ page }) => {
    const email = uniqueEmail("import");
    await signInWithCode(page, email);
    await completeOnboarding(page);
    await expect(page).toHaveURL("/");

    await page.goto("/add");
    await page.getByRole("tab", { name: "File" }).click();
    await expect(page.getByRole("heading", { name: "Nhập file dành cho Premium" })).toBeVisible();

    const admin = serverAdmin();
    test.skip(!admin, "cần E2E_SUPABASE_SECRET_KEY để bật Premium");
    await admin!
      .from("profiles")
      .update({ plan: "premium" })
      .eq("user_id", await userIdByEmail(email));

    await page.reload();
    await page.getByRole("tab", { name: "File" }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "ielts.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "\uFEFFTừ vựng,Nghĩa,Chủ đề\nresilient,kiên cường,IELTS\n,thiếu từ,\nrun,chạy,\n",
        "utf8",
      ),
    });
    await expect(page.getByText("ielts.csv")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Dòng đầu là tiêu đề cột" })).toBeChecked();
    await expect(page.getByRole("combobox", { name: "Cột A" })).toHaveValue("word");
    await expect(page.getByRole("combobox", { name: "Cột B" })).toHaveValue("meaning");
    await expect(page.getByRole("combobox", { name: "Cột C" })).toHaveValue("tags");
    await expect(page.getByRole("button", { name: "Kiểm tra danh sách" })).toBeEnabled();
  });
});
