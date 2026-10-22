import { expect, test, type Page } from "@playwright/test";
import { hasSupabase, readLocalStore, signInWithCode, uniqueEmail } from "./helpers";
import { learnStarterWords, type Card } from "./review-helpers";

// Micro giả của Chromium, tự cho phép quyền micro; điểm chấm giả lập (CI không có khóa Azure).
test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["microphone"],
});

type Log = { mode: string; rating: number; pronunciation_score: number | null };
type Hooks = { __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> } };

const result = (overall: number) => ({
  overall,
  accuracy: overall,
  fluency: 100,
  completeness: 100,
  recognized: "word",
  words: [
    {
      word: "word",
      accuracy: overall,
      errorType: overall < 60 ? "Mispronunciation" : "None",
      phonemes: [
        { ipa: "θ", score: overall < 60 ? 30 : 90 },
        { ipa: "ɪ", score: 92 },
        { ipa: "k", score: overall < 60 ? 40 : 85 },
      ],
    },
  ],
});

/** Lượt chấm đầu tiên được 45 điểm (có mẹo sửa âm), các lượt sau 86 điểm. */
async function mockScoring(page: Page) {
  let calls = 0;
  await page.route("**/functions/v1/assess-pronunciation", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    calls++;
    await route.fulfill({ json: { status: "ok", result: result(calls === 1 ? 45 : 86) } });
  });
}

/** Thẻ Nghĩa đã thuộc (mức 3) → mở thẻ Phát âm. */
const KNOWN = {
  state: 2,
  stability: 10,
  difficulty: 5,
  reps: 3,
  scheduled_days: 10,
  learning_steps: 0,
  last_review: new Date(Date.now() - 10 * 86_400_000).toISOString(),
};

test.describe("Tập phát âm", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("luyện phát âm: thu âm → điểm, âm tô màu, mẹo; ghi điểm vào lượt ôn; tạm tắt trong phiên", async ({
    page,
  }) => {
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    // Khách chọn Phát âm ở Luyện tập: mời đăng nhập.
    await page.goto("/practice");
    await page
      .getByRole("radiogroup", { name: "Chế độ" })
      .getByRole("radio", { name: "Phát âm" })
      .click();
    await expect(page.getByText("Phát âm cần đăng nhập để chấm điểm.")).toBeVisible();

    await signInWithCode(page, uniqueEmail("speak"));
    await expect(page).toHaveURL("/");
    await page.evaluate(
      (patch) => (window as unknown as Hooks).__wordwiseE2E.patchCards("meaning", patch),
      KNOWN,
    );
    await expect
      .poll(
        async () =>
          (await readLocalStore<Card>(page, "cards")).filter((c) => c.skill === "speaking").length,
      )
      .toBe(5);
    await mockScoring(page);

    await page.goto("/practice");
    await page
      .getByRole("radiogroup", { name: "Chế độ" })
      .getByRole("radio", { name: "Phát âm" })
      .click();
    await expect(page.getByText("Có 5 từ phù hợp – buổi luyện 5 câu.")).toBeVisible();
    await page.getByRole("button", { name: "Bắt đầu luyện" }).click();

    const done = page.getByRole("button", { name: "Xong", exact: true });
    for (let i = 0; i < 12; i++) {
      await expect(page.getByText("Nghe mẫu rồi đọc to từ này").or(done)).toBeVisible();
      if (await done.isVisible()) break;
      await page.getByRole("button", { name: "Bắt đầu đọc" }).click();
      if (i === 0) {
        await expect(page.getByRole("dialog", { name: "Cho phép dùng micro" })).toBeVisible();
        await page.getByRole("button", { name: "Cho phép micro" }).click();
      }
      // Micro giả: tự dừng (im lặng hoặc hết 5 giây) rồi chấm.
      await expect(page.getByText(/^(?:✗ |✓ |~ )?\d+ điểm$/)).toBeVisible({ timeout: 10_000 });
      if (i === 0) {
        await expect(page.getByText("Cần luyện thêm")).toBeVisible();
        await expect(page.getByRole("list", { name: "Điểm từng âm" })).toBeVisible();
        await expect(page.getByRole("list", { name: "Mẹo sửa âm" })).toContainText("hai hàm răng");
        await expect(page.getByText("Điểm do máy chấm, chỉ mang tính tham khảo.")).toBeVisible();
      }
      await page.getByRole("button", { name: "Tiếp", exact: true }).click();
    }
    await expect(done).toBeVisible();

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter(
      (l) => l.mode === "speaking",
    );
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(logs.every((l) => typeof l.pronunciation_score === "number")).toBe(true);
    // 45 điểm → Quên; 86 điểm → Nhớ.
    expect(logs.find((l) => l.pronunciation_score === 45)?.rating).toBe(1);
    expect(logs.find((l) => l.pronunciation_score === 86)?.rating).toBe(3);

    // Bật Luyện phát âm: thẻ Phát âm đến hạn vào phiên ôn; "Tạm tắt phát âm" bỏ các câu đó.
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Luyện phát âm" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // Chỉ thẻ Phát âm đến hạn (thẻ Nghĩa dời sang mai).
    await page.evaluate(
      async (tomorrow) => {
        const hooks = (window as unknown as Hooks).__wordwiseE2E;
        await hooks.patchCards("meaning", { due: tomorrow });
        await hooks.patchCards("speaking");
      },
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    await page.goto("/review/session");
    await expect(page.getByText("Nghe mẫu rồi đọc to từ này")).toBeVisible();
    await page.getByRole("button", { name: "Tạm tắt phát âm" }).click();
    await expect(page.getByText("Nghe mẫu rồi đọc to từ này")).toBeHidden();
  });
});
