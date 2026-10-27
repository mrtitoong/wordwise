import { expect, test } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore, waitForTestHooks } from "./helpers";
import {
  currentAnswer,
  answerCorrectly,
  forceModes,
  learnStarterWords,
  typeAnswer,
  writeCorrectly,
  type Card,
  type Log,
} from "./review-helpers";

test.describe("Phiên ôn", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");
  // Học 5 từ khởi đầu (xem thẻ đủ 5 tab, mỗi từ quay lại 2 lần) rồi mới tới phần chính của test.
  test.setTimeout(90_000);

  test("học 5 từ khởi đầu → ôn hết → lịch ôn cập nhật, chuỗi ngày học bắt đầu", async ({
    page,
  }) => {
    const totals: number[] = [];
    const seen = await learnStarterWords(page, totals);
    expect(seen.filter((s) => s === "intro")).toHaveLength(5);
    // Mỗi từ mới: xem thẻ (tự ghi "Khó") → quay lại 2 lần trong cùng phiên dưới dạng câu hỏi tự chấm.
    expect(seen).toHaveLength(15);
    // Số câu của phiên tính đủ ngay từ đầu: trả lời đúng hết thì không tăng.
    expect(new Set(totals)).toEqual(new Set([15]));
    // Chuyển câu (trả lời → khung hình có câu sau, gồm ghi lượt ôn vào IndexedDB): mục tiêu < 100 ms.
    const transitions = await page.evaluate(() =>
      performance.getEntriesByName("ww:next-question").map((e) => Math.round(e.duration)),
    );
    test.info().annotations.push({ type: "chuyển câu (ms)", description: transitions.join(", ") });
    // CI: in thành ghi chú của GitHub Actions (xem được ở trang Actions, ghi vào docs/qa/performance.md).
    if (process.env.CI) console.log(`::notice title=Chuyển câu (ms)::${transitions.join(", ")}`);
    expect(transitions.length).toBeGreaterThanOrEqual(10);
    const sorted = [...transitions].sort((x, y) => x - y);
    expect(sorted[Math.floor(sorted.length / 2)]!).toBeLessThan(100);

    await expect(page.getByText("Chuỗi 1 ngày")).toBeVisible();
    await expect(page.getByText("Không sai câu nào!")).toBeVisible();

    const all = await readLocalStore<Card>(page, "cards");
    const logs = await readLocalStore<Log>(page, "review_logs");
    const cards = all.filter((c) => c.skill === "meaning");
    expect(cards).toHaveLength(5);
    // Từ đã qua bước học có thêm thẻ Chính tả (chưa ôn, đến hạn trong vòng 1 ngày).
    const spelling = all.filter((c) => c.skill === "spelling");
    expect(spelling).toHaveLength(5);
    for (const card of spelling) {
      expect(card.state).toBe(0);
      expect(Date.parse(card.due)).toBeLessThanOrEqual(Date.now() + 86_400_000);
    }
    for (const card of cards) {
      expect(card.state).not.toBe(0);
      expect(card.reps).toBeGreaterThanOrEqual(2);
      expect(Date.parse(card.due)).toBeGreaterThan(Date.now());
    }
    expect(logs.length).toBe(seen.length);
    expect(logs.every((l) => ["flashcard", "mcq", "listening"].includes(l.mode))).toBe(true);
    expect(logs.every((l) => !l.is_extra)).toBe(true);
    const intros = logs.filter((l) => l.correct === null);
    expect(intros).toHaveLength(5);
    expect(intros.every((l) => l.mode === "flashcard" && l.rating === 2)).toBe(true);
    expect(logs.filter((l) => l.correct !== null).every((l) => l.rating >= 3)).toBe(true);

    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Xong hôm nay!" })).toBeVisible();
    await expect(page.getByText("Chuỗi 1 ngày")).toBeVisible();
  });

  test("ghi vào máy chậm (máy bận): câu sau vẫn hiện ngay, đáp án khớp từ đang hỏi", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", stayInSession: true });
    await expect(page.getByRole("progressbar", { name: "Tiến độ phiên" })).toBeVisible();

    // Ghi lượt ôn và lưu phiên dở chậm 30 giây mỗi lần (như khi máy bận): trước đây câu sau chờ ghi
    // xong mới hiện (treo cả phút), và chờ lưu xong mới có đáp án (chữ của câu mới đi với đáp án cũ).
    await forceModes(page, { saveDelayMs: 30_000 });

    // Mỗi câu trắc nghiệm: answerCorrectly kiểm tra đáp án đúng của từ đang hỏi có trong 4 đáp án.
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) seen.push(await answerCorrectly(page));
    expect(seen).toContain("mcq");
    const transitions = await page.evaluate(() =>
      performance.getEntriesByName("ww:next-question").map((e) => Math.round(e.duration)),
    );
    expect(transitions.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...transitions)).toBeLessThan(1_000);
  });

  test("thoát giữa phiên → kết quả đã lưu, Hôm nay có Tiếp tục phiên dở; Ôn từ này ngoài lịch", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", stayInSession: true });

    // Từ đầu tiên: thẻ đủ 5 tab ngay trong phiên, xem tab Ví dụ rồi "Đã xem xong" (tự ghi "Khó").
    await expect(page.getByRole("tab", { name: "Nghĩa" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Ví dụ" }).click();
    await expect(page.getByRole("link", { name: "Xem thẻ đầy đủ" })).toHaveCount(0);
    await page.getByRole("button", { name: "Đã xem xong" }).click();
    await expect(page.getByText("2/")).toBeVisible();

    await page.getByRole("button", { name: "Thoát phiên" }).click();
    await page.getByRole("button", { name: "Thoát", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Tiếp tục phiên dở")).toBeVisible();
    const logs = await readLocalStore<Log>(page, "review_logs");
    expect(logs.map((l) => [l.rating, l.correct])).toEqual([[2, null]]);

    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL("/review/session?resume=1");
    await expect(page.getByText(/^2\//)).toBeVisible();

    // Ôn từ này: mở thẻ từ của một từ đã có rồi bấm "Ôn từ này".
    await page.goto("/notebooks");
    await page.getByRole("link", { name: /Sổ của tôi/ }).click();
    await page.getByRole("list", { name: "Sổ của tôi" }).getByRole("link").first().click();
    await page.getByRole("link", { name: "Ôn từ này" }).click();
    await expect(page).toHaveURL(/\/review\/session\?card=/);
    // Một câu nếu từ đã xem (ôn ngoài lịch); từ chưa học thì tính đủ xem thẻ + 2 lần quay lại.
    await expect(page.getByText(/^1\/(1|3)$/)).toBeVisible();
  });

  test("tập viết: thẻ Chính tả đến hạn → viết đúng, dùng gợi ý thì Khó; tắt Luyện chính tả thì không hỏi", async ({
    page,
  }) => {
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");

    await waitForTestHooks(page);
    const count = await page.evaluate(() =>
      (
        window as unknown as { __wordwiseE2E: { patchCards: (skill: string) => Promise<number> } }
      ).__wordwiseE2E.patchCards("spelling"),
    );
    expect(count).toBe(5);

    await page.goto("/review/session");
    // 5 thẻ Chính tả mới, mỗi thẻ quay lại một lần ở bước học 10 phút: phiên tính đủ 10 câu.
    await expect(page.getByText(/^1\/10$/)).toBeVisible();
    await expect(page.getByText("Viết từ tiếng Anh có nghĩa này")).toBeVisible();
    // Thẻ mới qua bước học 10 phút nên quay lại trong cùng phiên: viết tới khi hết phiên.
    const done = page.getByRole("button", { name: "Xong", exact: true });
    let written = 0;
    for (; written < 30; written++) {
      await expect(page.getByText("Viết từ tiếng Anh có nghĩa này").or(done)).toBeVisible();
      if (await done.isVisible()) break;
      await writeCorrectly(page, { hint: written === 0 });
      await expect(page.getByText("Chính xác!")).toBeVisible();
      await expect(page.getByText("Chính xác!")).toBeHidden();
    }
    expect(written).toBeGreaterThanOrEqual(5);

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter(
      (l) => l.mode === "writing",
    );
    expect(logs).toHaveLength(written);
    // Gợi ý → Khó và ghi cấp gợi ý; cấp dễ (xếp chữ, điền chữ thiếu) đúng tối đa "Nhớ".
    const hinted = logs.filter((l) => l.hint_level > 0);
    expect(hinted).toHaveLength(1);
    expect(hinted[0]!.rating).toBe(2);
    expect(logs.every((l) => l.rating >= 2 && l.rating <= 3)).toBe(true);
    const spelling = (await readLocalStore<Card>(page, "cards")).filter(
      (c) => c.skill === "spelling",
    );
    expect(spelling.every((c) => c.state !== 0)).toBe(true);

    // Tắt Luyện chính tả: thẻ Chính tả đến hạn không vào phiên.
    await page.goto("/settings");
    const toggle = page.getByRole("switch", { name: "Luyện chính tả" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await waitForTestHooks(page);
    await page.evaluate(() =>
      (
        window as unknown as { __wordwiseE2E: { patchCards: (skill: string) => Promise<number> } }
      ).__wordwiseE2E.patchCards("spelling"),
    );
    await page.goto("/review/session");
    await expect(page.getByText("Không có gì cần ôn lúc này")).toBeVisible();
  });

  test("tập nghe: nghe → gõ lại, nghe câu → điền từ, nghe → chọn nghĩa; nghe lại nhiều lần thì Khó", async ({
    page,
  }) => {
    type Hooks = {
      __wordwiseE2E: { patchCards: (skill: string, patch?: object) => Promise<number> };
    };
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");

    // Thẻ đã thuộc (mức 3: S = 10 ngày), đến hạn ngay; ép dạng câu hỏi để không phụ thuộc ngẫu nhiên.
    const known = {
      state: 2,
      stability: 10,
      difficulty: 5,
      reps: 3,
      scheduled_days: 10,
      learning_steps: 0,
      last_review: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    };
    const starts: string[] = [];
    const run = async (skill: string, overrides: object, title: string) => {
      starts.push(new Date().toISOString());
      await waitForTestHooks(page);
      await page.evaluate(
        ([s, p, o]) => {
          localStorage.setItem("ww_e2e_overrides", JSON.stringify(o));
          return (window as unknown as Hooks).__wordwiseE2E.patchCards(s as string, p as object);
        },
        [skill, known, overrides] as const,
      );
      await page.goto("/review/session");
      const done = page.getByRole("button", { name: "Xong", exact: true });
      let answered = 0;
      for (; answered < 10; answered++) {
        await expect(page.getByText(title).or(done)).toBeVisible();
        if (await done.isVisible()) break;
        // Nút nghe to: nghe lại 4 lần ở câu đầu (quá 3 lần → tính là dùng gợi ý).
        const listen = page.getByRole("button", { name: "Nghe lại" });
        await expect(listen).toBeVisible();
        if (answered === 0) for (let i = 0; i < 4; i++) await listen.click();
        if (answered === 0) await expect(page.getByText("Đã nghe lại 4 lần")).toBeVisible();
        if (skill === "meaning") {
          await answerCorrectly(page);
        } else {
          await typeAnswer(page, await currentAnswer(page));
          await expect(page.getByText("Chính xác!")).toBeVisible();
          await expect(page.getByText("Chính xác!")).toBeHidden();
        }
      }
      await page.getByRole("button", { name: "Xong", exact: true }).click();
      return answered;
    };

    // Phiên học từ khởi đầu có thể đã hỏi vài câu nghe → chọn nghĩa: chỉ đếm từ đây.
    const since = new Date().toISOString();
    expect(await run("spelling", { spellingKind: "listen-type" }, "Nghe rồi gõ lại từ")).toBe(5);
    // Câu ví dụ hiện có chỗ trống: chỉ thẻ có câu khuyết được từ (thường là cả 5 từ khởi đầu).
    expect(
      await run("spelling", { spellingKind: "listen-cloze" }, "Nghe câu rồi điền từ còn thiếu"),
    ).toBe(5);
    expect(await run("meaning", { meaningMode: "listening" }, "Nghe rồi chọn nghĩa đúng")).toBe(5);

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter(
      (l) => l.mode === "listening" && l.reviewed_at >= since,
    );
    expect(logs).toHaveLength(15);
    // Câu đầu của mỗi lượt nghe lại 4 lần: chấm Khó; câu gõ có ghi cấp gợi ý. (Câu khác có thể
    // là Khó vì trả lời chậm hơn 2 lần trung vị – tùy tốc độ máy, nên không đếm cứng.)
    for (const start of starts) {
      const first = logs
        .filter((l) => l.reviewed_at >= start)
        .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))[0]!;
      expect(first.rating).toBe(2);
    }
    expect(logs.filter((l) => l.hint_level > 0)).toHaveLength(2);
    expect(logs.every((l) => l.rating >= 2)).toBe(true);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Phiên ôn" })).toBeVisible();
    const multi = page.getByRole("switch", { name: "Luyện nhiều giọng" });
    await expect(multi).toHaveAttribute("aria-checked", "false");
    await multi.click();
    await expect(multi).toHaveAttribute("aria-checked", "true");
  });

  test("luyện tập: chọn chế độ → luyện ngoài lịch, nhớ được thì lịch ôn giữ nguyên", async ({
    page,
  }) => {
    await learnStarterWords(page);
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page).toHaveURL("/");
    const before = await readLocalStore<Card>(page, "cards");

    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Luyện tập" })
      .click();
    await expect(page).toHaveURL("/practice");
    await expect(page.getByText("Có 5 từ phù hợp – buổi luyện 5 câu.")).toBeVisible();

    // Không có từ hay quên.
    await page
      .getByRole("radiogroup", { name: "Trạng thái" })
      .getByRole("radio", { name: "Hay quên" })
      .click();
    await expect(page.getByText("Chưa có từ nào phù hợp.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bắt đầu luyện" })).toBeDisabled();
    await page
      .getByRole("radiogroup", { name: "Trạng thái" })
      .getByRole("radio", { name: "Tất cả" })
      .click();

    // Trắc nghiệm: 5 câu, đều là ôn ngoài lịch (thẻ chưa đến hạn).
    const modes = page.getByRole("radiogroup", { name: "Chế độ" });
    await modes.getByRole("radio", { name: "Trắc nghiệm" }).click();
    await page.getByRole("button", { name: "Bắt đầu luyện" }).click();
    await expect(page).toHaveURL(/\/review\/session\?practice=1&mode=mcq&n=10/);
    await expect(page.getByText(/^1\/5$/)).toBeVisible();
    for (let i = 0; i < 5; i++) expect(await answerCorrectly(page)).toBe("mcq");
    await page.getByRole("button", { name: "Xong", exact: true }).click();

    // Tập viết: thẻ Chính tả (vừa mở sau khi học nghĩa).
    await page.goto("/practice");
    await modes.getByRole("radio", { name: "Tập viết" }).click();
    await expect(page.getByText("Có 5 từ phù hợp – buổi luyện 5 câu.")).toBeVisible();
    await page.getByRole("button", { name: "Bắt đầu luyện" }).click();
    for (let i = 0; i < 5; i++) {
      await writeCorrectly(page);
      await expect(page.getByText("Chính xác!")).toBeVisible();
      await expect(page.getByText("Chính xác!")).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Xong", exact: true })).toBeVisible();

    const logs = (await readLocalStore<Log>(page, "review_logs")).filter((l) => l.is_extra);
    expect(logs.filter((l) => l.mode === "mcq")).toHaveLength(5);
    expect(logs.filter((l) => l.mode === "writing")).toHaveLength(5);
    // Nhớ được khi ôn ngoài lịch: thẻ không đổi.
    const after = await readLocalStore<Card>(page, "cards");
    for (const card of before) {
      const now = after.find((c) => c.id === card.id)!;
      expect([now.state, now.due, now.reps]).toEqual([card.state, card.due, card.reps]);
    }
  });
});
