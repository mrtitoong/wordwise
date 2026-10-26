import { expect, test } from "@playwright/test";
import { hasSupabase, noHorizontalScroll, readLocalStore, startAsGuest } from "../helpers";
import { answerQuestion, type Log, type Step } from "../review-helpers";

type FullLog = Log & { response_ms: number | null };

const GROUP: Record<string, string> = {
  flashcard: "Nghĩa",
  mcq: "Nghĩa",
  writing: "Viết",
  listening: "Nghe",
  speaking: "Nói",
};

test.describe("Luồng 5 – thống kê sau phiên ôn", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("ôn một phiên (sai 1 câu) → Thống kê khớp với các lượt vừa ôn", async ({ page }) => {
    test.setTimeout(120_000);
    await startAsGuest(page, { stayInSession: true });

    // Học 5 từ khởi đầu, cố ý trả lời sai câu trắc nghiệm đầu tiên.
    let missed = false;
    const steps: Step[] = [];
    for (let i = 0; i < 60; i++) {
      const step = await answerQuestion(page, { wrong: !missed });
      if (step === "done") break;
      if (step === "mcq" || step === "listening") missed = true;
      steps.push(step);
    }
    expect(missed).toBe(true);
    await expect(page.getByText("Từ cần chú ý")).toBeVisible();
    await page.getByRole("button", { name: "Xong", exact: true }).click();

    // Số liệu mong đợi tính thẳng từ lượt ôn trong máy (lượt tự ghi khi xem từ mới không tính).
    const logs = await readLocalStore<FullLog>(page, "review_logs");
    expect(logs).toHaveLength(steps.length);
    const answers = logs.filter((l) => l.correct !== null);
    const minutes = Math.round(
      logs.reduce((sum, l) => sum + Math.min(Math.max(l.response_ms ?? 0, 0), 60_000), 0) / 60_000,
    );

    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Chuỗi ngày học" })).toBeVisible();
    await expect(page.getByText("1 ngày", { exact: true }).first()).toBeVisible();
    // Mới 1 ngày dữ liệu: chưa tính tỉ lệ nhớ.
    await expect(page.getByText("Cần thêm dữ liệu (học đủ 7 ngày)")).toBeVisible();
    await expect(page.getByText(`${minutes} phút`, { exact: true }).first()).toBeVisible();

    for (const group of ["Nghĩa", "Viết", "Nghe", "Nói"]) {
      const inGroup = answers.filter((l) => GROUP[l.mode] === group);
      const label = page.getByRole("img", { name: new RegExp(`^${group}: `) });
      if (inGroup.length === 0) {
        await expect(label).toHaveAccessibleName(`${group}: chưa có`);
        continue;
      }
      const correct = inGroup.filter((l) => l.rating !== 1).length;
      const percent = Math.round((correct / inGroup.length) * 100);
      await expect(label).toHaveAccessibleName(
        `${group}: ${percent}%, ${correct}/${inGroup.length} câu`,
      );
    }
    // Có ít nhất một câu sai nên Nghĩa hoặc Nghe dưới 100%.
    expect(answers.some((l) => l.rating === 1)).toBe(true);

    // Heatmap: ô hôm nay có phút học; từ vừa sai nằm trong "Từ hay quên".
    const today = page.getByRole("group", { name: "Phút học mỗi ngày" }).locator("rect[data-day]");
    await today.last().click();
    await expect(
      page.locator("p[role=status]").filter({ hasText: /^\d+\/\d+: \d+ phút$/ }),
    ).toBeVisible();
    await expect(page.getByText("Quên 1 lần trong 30 ngày").first()).toBeVisible();
    await noHorizontalScroll(page);
  });
});
