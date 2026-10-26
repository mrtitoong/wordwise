import { expect, test } from "@playwright/test";
import {
  hasSupabase,
  noHorizontalScroll,
  readLocalStore,
  serverAdmin,
  signInAsAdmin,
  startAsGuest,
} from "../helpers";

/** Từ mẫu (seed) Admin dán vào danh sách. */
const WORDS = ["deadline", "opportunity", "schedule"];

/**
 * Thay worker analyze-list (Edge Function gọi AI, CI không chạy): ghi kết quả phân tích như các bước
 * trích xuất → chọn nghĩa → sắp xếp đã xong, rồi đóng việc bằng finish_list_analysis như worker.
 * Pipeline thật có unit test (src/lib/admin/analysis) và job CI `functions`.
 */
async function finishAnalysis(listId: string) {
  const admin = serverAdmin()!;
  const { data: job } = await admin
    .from("import_jobs")
    .select("id")
    .eq("list_id", listId)
    .eq("kind", "admin_list")
    .eq("status", "queued")
    .single();
  if (!job) throw new Error("không thấy việc phân tích đang chờ");
  const running = await admin
    .from("import_jobs")
    .update({ status: "running", step: "warn", locked_at: new Date().toISOString() })
    .eq("id", job.id);
  if (running.error) throw new Error(running.error.message);

  const { data: senses, error } = await admin
    .from("word_senses")
    .select("id, word_id, words!inner (lemma, pos)")
    .in("words.lemma", WORDS)
    .eq("sense_order", 0);
  if (error) throw new Error(error.message);
  const rows = senses as unknown as {
    id: string;
    word_id: string;
    words: { lemma: string; pos: string };
  }[];
  const candidates = WORDS.map((lemma, i) => {
    const sense = rows.find((r) => r.words.lemma === lemma)!;
    return {
      job_id: job.id,
      list_id: listId,
      stage: "triaged",
      position: i,
      surface: lemma,
      lemma,
      pos: sense.words.pos,
      word_id: sense.word_id,
      sense_id: sense.id,
      sense_method: "single",
      sense_confidence: 1,
      subtopic: "Công việc",
      item_order: i,
      warnings: lemma === "schedule" ? [{ code: "no_context" }] : [],
    };
  });
  const inserted = await admin.from("curated_list_candidates").insert(candidates);
  if (inserted.error) throw new Error(inserted.error.message);
  const finished = await admin.rpc("finish_list_analysis", {
    p_job_id: job.id,
    p_summary: { items: WORDS.length },
  });
  if (finished.error) throw new Error(finished.error.message);
}

test.describe("Luồng 7 – Admin xuất bản danh sách, người học thêm vào sổ", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("Admin tạo danh sách → phân tích → duyệt → xuất bản → người học thêm vào sổ", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const title = `Từ vựng công sở ${Date.now()}`;

    // Admin: khai báo danh sách, dán từ, phân tích.
    await signInAsAdmin(page, "/admin");
    await page.waitForURL(/\/(onboarding|admin)/);
    await page.goto("/admin/lists/new");
    await page.getByLabel("Tên danh sách").fill(title);
    await page.getByLabel("Trình độ mục tiêu").selectOption("B1");
    await page.getByLabel("Số ngày gợi ý").fill("30");
    await page.getByRole("button", { name: "Tạo danh sách" }).click();
    await expect(page).toHaveURL(/\/admin\/lists\/[0-9a-f-]{36}$/);
    const listId = page.url().split("/").pop()!;

    await page.getByRole("tab", { name: "Dán văn bản" }).click();
    await page.getByRole("textbox", { name: "Dán văn bản" }).fill(WORDS.join("\n"));
    await page.getByRole("button", { name: "Thêm nguồn" }).click();
    await expect(page.getByText("Dán văn bản · 3 từ")).toBeVisible();
    await page.getByRole("button", { name: "Phân tích", exact: true }).click();
    await expect(page.getByText("Đang chờ đến lượt…")).toBeVisible();

    // Worker phân tích xong: trang tự hỏi lại (2 giây) và chuyển sang Chờ duyệt.
    await finishAnalysis(listId);
    await expect(page.getByText("Phân tích xong. Danh sách đang chờ duyệt.")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "Duyệt 3 từ" }).click();
    await expect(page).toHaveURL(`/admin/lists/${listId}/review`);

    // Duyệt: chấp nhận từ không cảnh báo, rồi duyệt nốt từ có cảnh báo; xuất bản.
    await expect(page.getByText("Đã duyệt 0/3 từ")).toBeVisible();
    await page.getByRole("button", { name: /Chấp nhận tất cả từ không có cảnh báo \(2\)/ }).click();
    await expect(page.getByText("Đã duyệt 2/3 từ")).toBeVisible();
    await page.getByRole("button", { name: "Duyệt tất (1)" }).click();
    await expect(page.getByText("Đã duyệt 3/3 từ")).toBeVisible();
    await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByText("Đã xuất bản phiên bản 1.")).toBeVisible();
    const { data: releases } = await serverAdmin()!
      .from("curated_list_releases")
      .select("version, word_count")
      .eq("list_id", listId);
    expect(releases).toEqual([{ version: 1, word_count: 3 }]);

    // Người học (khách, trình duyệt khác): Thư viện → thêm vào sổ mới.
    const learner = await browser.newContext();
    const learnerPage = await learner.newPage();
    await startAsGuest(learnerPage, { starters: false });
    await learnerPage.goto("/library");
    const card = learnerPage.getByRole("link", { name: new RegExp(title) });
    try {
      await card.waitFor({ timeout: 15_000 });
    } catch {
      const text = (await learnerPage.locator("body").innerText()).slice(0, 1500);
      throw new Error(`Thư viện không có “${title}” (${learnerPage.url()}):\n${text}`);
    }
    await card.click();
    await expect(learnerPage).toHaveURL(`/library/${listId}`);
    await expect(learnerPage.getByText("Công việc", { exact: true })).toBeVisible();
    await noHorizontalScroll(learnerPage);
    await learnerPage.getByRole("button", { name: "Thêm vào sổ tay" }).click();
    const sheet = learnerPage.getByRole("dialog", { name: "Thêm vào sổ tay" });
    await sheet.getByRole("button", { name: "Tiếp" }).click();
    await sheet.getByRole("checkbox", { name: /Không đặt ngày mục tiêu/ }).check();
    await sheet.getByRole("button", { name: "Thêm 3 từ" }).click();
    const done = learnerPage.getByRole("dialog", { name: `Đã thêm vào sổ “${title}”` });
    await expect(done.getByText(/3 từ mới vào sổ/)).toBeVisible();
    await done.getByRole("link", { name: "Mở sổ" }).click();

    const list = learnerPage.getByRole("list", { name: title });
    for (const lemma of WORDS) {
      await expect(list.getByRole("link", { name: new RegExp(lemma) })).toBeVisible();
    }
    const entries = await readLocalStore<{ input_method: string; source: string; tags: string[] }>(
      learnerPage,
      "notebook_entries",
    );
    expect(entries).toHaveLength(3);
    expect(
      entries.every(
        (e) =>
          e.input_method === "list" &&
          e.source === `list:${listId}` &&
          e.tags.includes("Công việc"),
      ),
    ).toBe(true);
    await learner.close();
  });
});
