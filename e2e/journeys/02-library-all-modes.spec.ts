import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  noHorizontalScroll,
  readLocalStore,
  signInWithCode,
  uniqueEmail,
} from "../helpers";
import { seedList } from "../lists";
import { FAKE_MICROPHONE, mockPronunciation } from "../mocks";
import {
  finishSession,
  forceModes,
  KNOWN_CARD,
  patchCards,
  type Card,
  type Log,
} from "../review-helpers";

test.use(FAKE_MICROPHONE);

/** Từ mẫu (seed) của bộ "IELTS – Environment". */
const WORDS = ["environment", "sustainable", "biodiversity", "mitigate", "resilient"];

test.describe("Luồng 2 – onboarding, bộ từ có sẵn, ôn đủ 5 chế độ", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("onboarding → bộ IELTS Environment → học → ôn 10 thẻ đủ 5 chế độ", async ({ page }) => {
    test.setTimeout(180_000);
    // Không đặt số ngày gợi ý: học theo số từ mới mỗi ngày (5 từ đều mở hôm nay).
    const title = `IELTS – Environment ${Date.now()}`;
    await seedList(title, WORDS, { suggestedDays: null });

    // Phát âm cần đăng nhập nên dùng tài khoản mới, onboarding chọn tự thêm từ.
    await signInWithCode(page, uniqueEmail("journey-modes"));
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");

    await page.goto("/library");
    await noHorizontalScroll(page);
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.getByRole("button", { name: "Thêm vào sổ tay" }).click();
    const sheet = page.getByRole("dialog", { name: "Thêm vào sổ tay" });
    await sheet.getByRole("button", { name: "Tiếp" }).click();
    await sheet.getByRole("checkbox", { name: /Không đặt ngày mục tiêu/ }).check();
    await sheet.getByRole("button", { name: "Thêm 5 từ" }).click();
    const done = page.getByRole("dialog", { name: `Đã thêm vào sổ “${title}”` });
    await expect(done.getByText(/5 từ mới vào sổ · 5 từ học hôm nay/)).toBeVisible();
    await done.getByRole("link", { name: "Học ngay" }).click();
    await expect(page).toHaveURL(/\/review\/session/);

    // Học 5 từ mới: thẻ đủ 5 tab rồi câu hỏi lại trong cùng phiên.
    const learned = await finishSession(page);
    expect(learned.filter((s) => s === "intro")).toHaveLength(5);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");

    // Bật Luyện phát âm để thẻ Phát âm vào phiên ôn.
    await page.goto("/settings");
    const speaking = page.getByRole("switch", { name: "Luyện phát âm" });
    await speaking.click();
    await expect(speaking).toHaveAttribute("aria-checked", "true");

    // Coi như đã học vài ngày: 4 thẻ Nghĩa, 3 thẻ Chính tả, 3 thẻ Phát âm đến hạn = 10 thẻ.
    await patchCards(page, "meaning", KNOWN_CARD, 4);
    await expect
      .poll(
        async () =>
          (await readLocalStore<Card>(page, "cards")).filter((c) => c.skill === "speaking").length,
      )
      .toBe(5);
    await patchCards(page, "spelling", KNOWN_CARD, 3);
    await patchCards(page, "speaking", KNOWN_CARD, 3);
    await forceModes(page, {
      meaningMode: ["flashcard", "mcq", "listening"],
      spellingKind: "writing",
    });
    await mockPronunciation(page, [88]);

    const since = new Date().toISOString();
    await page.goto("/review/session");
    await expect(page.getByText(/^1\/10$/)).toBeVisible();
    await noHorizontalScroll(page);
    const modes = await finishSession(page, 12);
    expect(modes).toHaveLength(10);
    expect(new Set(modes)).toEqual(
      new Set(["flashcard", "mcq", "listening", "writing", "speaking"]),
    );
    await expect(page.getByText("Không sai câu nào!")).toBeVisible();

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter(
      (l) => l.reviewed_at >= since,
    );
    expect(logs).toHaveLength(10);
    // Đúng hết; câu trả lời chậm có thể là "Khó" (chậm hơn 2 lần trung vị) nên không đòi "Nhớ".
    expect(logs.every((l) => !l.is_extra && l.rating >= 2)).toBe(true);
    expect(new Set(logs.map((l) => l.mode))).toEqual(
      new Set(["flashcard", "mcq", "listening", "writing", "speaking"]),
    );
  });
});
