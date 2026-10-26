import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore, serverAdmin } from "./helpers";

/** Từ mẫu (seed) của danh sách test: 3 từ ở bản 1, bản 2 thêm "resilient". */
const V1 = ["sustainable", "environment", "deadline"] as const;
const V2_ADDED = "resilient";

type NotebookRow = {
  id: string;
  name: string;
  source_list_id: string | null;
  source_list_version: number | null;
  target_date: string | null;
};

async function firstSenses(lemmas: readonly string[]) {
  const { data, error } = await serverAdmin()!
    .from("word_senses")
    .select("id, words!inner (lemma)")
    .in("words.lemma", [...lemmas])
    .eq("sense_order", 0);
  if (error) throw new Error(error.message);
  const rows = data as unknown as { id: string; words: { lemma: string } }[];
  return lemmas.map((lemma) => rows.find((r) => r.words.lemma === lemma)!.id);
}

/** Xuất bản thẳng một bản phát hành (như admin_publish_list) bằng quyền service. */
async function publish(listId: string, version: number, senseIds: string[], added: string[]) {
  const admin = serverAdmin()!;
  const release = await admin.from("curated_list_releases").insert({
    list_id: listId,
    version,
    word_count: senseIds.length,
    added_sense_ids: added,
  });
  if (release.error) throw new Error(release.error.message);
  const items = await admin.from("curated_list_release_items").insert(
    senseIds.map((sense_id, i) => ({
      list_id: listId,
      version,
      sense_id,
      item_order: i,
      subtopic: i < 2 ? "Môi trường" : "Công việc",
    })),
  );
  if (items.error) throw new Error(items.error.message);
  const list = await admin
    .from("curated_lists")
    .update({ status: "published", version, published_at: new Date().toISOString() })
    .eq("id", listId);
  if (list.error) throw new Error(list.error.message);
}

async function seedList(title: string, lemmas: readonly string[] = V1) {
  const { data, error } = await serverAdmin()!
    .from("curated_lists")
    .insert({
      title,
      language: "en",
      status: "draft",
      target_cefr: "B2",
      purpose: "ielts",
      suggested_days: 45,
      description: "Danh sách thử cho E2E.",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message);
  const senses = await firstSenses(lemmas);
  await publish(data.id, 1, senses, senses);
  return { listId: data.id as string, senses };
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Thư viện và học theo thời hạn", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("khách: Thư viện → thêm vào sổ mới có ngày mục tiêu → lộ trình → nhận bản cập nhật", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const title = `IELTS E2E ${Date.now()}`;
    const { listId, senses } = await seedList(title);

    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");

    // Màn Hôm nay trống có lối vào Thư viện.
    await page.goto("/");
    await page.getByRole("link", { name: "Chọn bộ từ có sẵn" }).click();
    await expect(page).toHaveURL("/library");
    await noHorizontalScroll(page);

    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(`/library/${listId}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("3 từ đầu tiên")).toBeVisible();
    await expect(page.getByText("Môi trường", { exact: true })).toBeVisible();
    await noHorizontalScroll(page);

    // Chọn lọc: bỏ "deadline".
    await page.getByRole("button", { name: "Chọn lọc từ" }).click();
    const pick = page.getByRole("dialog", { name: "Chọn lọc từ" });
    await pick.getByRole("checkbox", { name: /deadline/ }).uncheck();
    await expect(pick.getByText("Đã chọn 2/3")).toBeVisible();
    await pick.getByRole("button", { name: "Xong" }).click();
    await expect(page.getByRole("button", { name: "Đã chọn 2/3 từ" })).toBeVisible();

    await page.getByRole("button", { name: "Thêm vào sổ tay" }).click();
    const sheet = page.getByRole("dialog", { name: "Thêm vào sổ tay" });
    await expect(sheet.getByRole("radio", { name: new RegExp(`Sổ mới “${title}”`) })).toBeChecked();
    await sheet.getByRole("button", { name: "Tiếp" }).click();
    await expect(sheet.getByText("Mỗi ngày 1 từ mới", { exact: false })).toBeVisible();
    await sheet.getByRole("button", { name: "Thêm 2 từ" }).click();

    const done = page.getByRole("dialog", { name: `Đã thêm vào sổ “${title}”` });
    await expect(
      done.getByText(/2 từ mới vào sổ · 1 từ học hôm nay · 1 từ chờ ở Sắp học/),
    ).toBeVisible();
    await done.getByRole("link", { name: "Mở sổ" }).click();
    await expect(page).toHaveURL(/\/notebooks\/[0-9a-f-]{36}$/);

    const plan = page.getByTestId("notebook-plan");
    await expect(plan.getByText(/còn 45 ngày/)).toBeVisible();
    await expect(plan.getByText("Đã học 0/2 từ")).toBeVisible();
    await expect(plan.getByText("Đúng kế hoạch")).toBeVisible();
    await expect(plan.getByText("Hôm nay: 1 từ mới theo lộ trình")).toBeVisible();
    await noHorizontalScroll(page);

    const notebook = (await readLocalStore<NotebookRow>(page, "notebooks")).find(
      (n) => n.source_list_id === listId,
    )!;
    expect(notebook).toMatchObject({ name: title, source_list_version: 1 });
    expect(notebook.target_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Thư viện đánh dấu đã thêm; chi tiết danh sách mở lại sổ.
    await page.goto(`/library/${listId}`);
    await expect(page.getByText(`Bạn đã thêm danh sách này vào sổ “${title}”.`)).toBeVisible();

    // Admin xuất bản bản 2 thêm một từ: sổ hỏi Nhận/Bỏ qua.
    const [added] = await firstSenses([V2_ADDED]);
    await publish(listId, 2, [...senses, added!], [added!]);
    await page.goto(`/notebooks/${notebook.id}`);
    const update = page.getByRole("region", { name: "Danh sách có thêm 1 từ" });
    await expect(update).toBeVisible();
    await update.getByRole("button", { name: "Nhận" }).click();
    await expect(page.getByText("Đã thêm 1 từ mới vào sổ")).toBeVisible();
    await expect(update).toHaveCount(0);
    await expect(page.getByRole("link", { name: /resilient/ })).toBeVisible();
    // "deadline" (bỏ khi chọn lọc ở bản 1) không bị thêm lại.
    await expect(page.getByRole("link", { name: /deadline/ })).toHaveCount(0);
    const after = (await readLocalStore<NotebookRow>(page, "notebooks")).find(
      (n) => n.id === notebook.id,
    )!;
    expect(after.source_list_version).toBe(2);

    // Đổi ngày mục tiêu từ thẻ Lộ trình.
    await plan.getByRole("button", { name: "Đổi ngày mục tiêu" }).click();
    const dateSheet = page.getByRole("dialog", { name: "Ngày mục tiêu" });
    await dateSheet.getByRole("button", { name: "Bỏ ngày mục tiêu" }).click();
    await expect(page.getByText("Đã bỏ ngày mục tiêu")).toBeVisible();
    await expect(page.getByTestId("notebook-plan")).toHaveCount(0);
  });

  test("kiểm tra đầu vào: hỏi từng từ → đề xuất đã biết → bỏ tích một từ → lưu", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const lemmas = [
      "affect",
      "bank",
      "biodiversity",
      "borrow",
      "colour",
      "deadline",
      "effect",
      "environment",
      "meet",
      "mitigate",
      "opportunity",
      "schedule",
    ];
    // Biết + chọn đúng nghĩa: 3 từ; "borrow": Biết nhưng chọn sai nghĩa → tính là chưa biết.
    const known = ["bank", "colour", "meet"];
    const title = `Placement E2E ${Date.now()}`;
    const { listId } = await seedList(title, lemmas);

    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");

    await page.goto(`/library/${listId}`);
    await page.getByRole("button", { name: "Thêm vào sổ tay" }).click();
    const sheet = page.getByRole("dialog", { name: "Thêm vào sổ tay" });
    await sheet.getByRole("button", { name: "Tiếp" }).click();
    await expect(sheet.getByText("Bạn đã biết một số từ?")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Bỏ qua, thêm 12 từ" })).toBeVisible();
    await sheet.getByRole("button", { name: "Kiểm tra trước" }).click();

    for (let i = 1; i <= lemmas.length; i++) {
      await expect(sheet.getByText(`Câu ${i}/${lemmas.length}`)).toBeVisible();
      const word = (await sheet.getByTestId("placement-word").textContent())!.trim();
      if (known.includes(word) || word === "borrow") {
        await sheet.getByRole("button", { name: "Biết", exact: true }).click();
        const options = sheet.locator("[data-e2e-answer]");
        const answer = (await options.getAttribute("data-e2e-answer"))!;
        const buttons = options.getByRole("button");
        if (word === "borrow") {
          await buttons.filter({ hasNotText: answer }).first().click();
        } else {
          await buttons.filter({ hasText: answer }).first().click();
        }
      } else {
        await sheet.getByRole("button", { name: i % 2 ? "Chưa biết" : "Không chắc" }).click();
      }
    }

    await expect(sheet.getByText("Kết quả kiểm tra")).toBeVisible();
    await expect(sheet.getByText("Bạn biết khoảng 25% danh sách.")).toBeVisible();
    await expect(sheet.getByText("3 từ vào lịch ôn thưa · 9 từ học mới")).toBeVisible();
    await noHorizontalScroll(page);

    // Xem lại (tùy chọn): bỏ tích "bank".
    await sheet.getByRole("button", { name: "Xem lại 3 từ đã biết" }).click();
    const groups = sheet.getByRole("button", { name: /Xem từng từ/ });
    const bank = sheet.getByRole("checkbox", { name: /bank/ });
    for (let g = 0; g < (await groups.count()) && !(await bank.isVisible()); g++) {
      await groups.nth(g).click();
    }
    await bank.uncheck();
    await expect(sheet.getByText("2 từ vào lịch ôn thưa · 10 từ học mới")).toBeVisible();
    await sheet.getByRole("button", { name: "Lưu", exact: true }).click();

    const done = page.getByRole("dialog", { name: `Đã thêm vào sổ “${title}”` });
    await expect(done.getByText("2 từ đã biết vào lịch ôn thưa", { exact: false })).toBeVisible();

    type Uw = { id: string; sense_id: string; status: string };
    type Card = { user_word_id: string; skill: string; state: number; reps: number };
    const senses = await firstSenses(lemmas);
    const userWords = await readLocalStore<Uw>(page, "user_words");
    const cards = await readLocalStore<Card>(page, "cards");
    const stateOf = (lemma: string) => {
      const uw = userWords.find((u) => u.sense_id === senses[lemmas.indexOf(lemma)])!;
      const card = cards.find((c) => c.user_word_id === uw.id && c.skill === "meaning")!;
      return { status: uw.status, state: card.state, reps: card.reps };
    };
    expect(stateOf("colour")).toEqual({ status: "learning", state: 2, reps: 0 });
    expect(stateOf("meet")).toEqual({ status: "learning", state: 2, reps: 0 });
    expect(stateOf("bank").state).toBe(0);
    expect(stateOf("borrow").state).toBe(0);
  });
});
