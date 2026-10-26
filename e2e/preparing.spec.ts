import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";

type NotebookRow = { id: string; name: string };

test.describe("Danh sách Đang chuẩn bị", () => {
  test.skip(!hasSupabase || !process.env.E2E_SUPABASE_SECRET_KEY, "cần Supabase cục bộ (CI)");

  test("từ đang tạo nội dung hiện ở Thêm từ và sổ; Thử lại khi lỗi; xong thì vào sổ", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("preparing");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    const userId = await userIdByEmail(email);
    const admin = serverAdmin()!;

    // "Sổ của tôi" đã đồng bộ lên máy chủ (yêu cầu tạo từ gắn với sổ đích).
    const notebook = await expect
      .poll(async () => {
        const local = (await readLocalStore<NotebookRow>(page, "notebooks"))[0];
        if (!local) return null;
        const { data } = await admin.from("notebooks").select("id").eq("id", local.id);
        return data?.length ? local : null;
      })
      .not.toBeNull()
      .then(async () => (await readLocalStore<NotebookRow>(page, "notebooks"))[0]!);

    const stamp = Date.now();
    const jobs = await admin
      .from("word_jobs")
      .insert([
        { language: "en", lemma: `prep-a-${stamp}`, pos: "noun", status: "running" },
        {
          language: "en",
          lemma: `prep-b-${stamp}`,
          pos: "noun",
          status: "failed",
          attempts: 3,
          finished_at: new Date().toISOString(),
        },
      ])
      .select("id, lemma");
    if (jobs.error) throw new Error(jobs.error.message);
    const [a, b] = jobs.data;
    const requests = await admin.from("word_job_requests").insert(
      [a!, b!].map((job) => ({
        job_id: job.id,
        user_id: userId,
        notebook_id: notebook.id,
        input_method: "typed",
        added_at: new Date().toISOString(),
      })),
    );
    if (requests.error) throw new Error(requests.error.message);

    await page.reload();
    const list = page.getByRole("region", { name: "Đang chuẩn bị nội dung (1)" });
    await expect(list).toBeVisible();
    await expect(list.getByText(a!.lemma)).toBeVisible();
    await expect(
      list.getByText(`đang chuẩn bị, khoảng 30 giây · sẽ vào “${notebook.name}”`),
    ).toBeVisible();
    await expect(list.getByText("chưa tạo được nội dung")).toBeVisible();

    // Thử lại: việc lỗi được xếp lại, không thêm yêu cầu mới.
    await list.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("region", { name: "Đang chuẩn bị nội dung (2)" })).toBeVisible();
    const { data: retried } = await admin
      .from("word_jobs")
      .select("status, user_retries")
      .eq("id", b!.id)
      .single();
    expect(retried).toEqual({ status: "queued", user_retries: 1 });
    const { count } = await admin
      .from("word_job_requests")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(count).toBe(2);

    // Việc A xong: danh sách tự cập nhật (hỏi lại mỗi 5 giây), chạm để mở thẻ từ.
    const { data: word } = await admin
      .from("words")
      .select("id")
      .eq("lemma", "sustainable")
      .single();
    await admin
      .from("word_jobs")
      .update({ status: "done", finished_at: new Date().toISOString(), word_id: word!.id })
      .eq("id", a!.id);
    const pending = page.getByRole("region", { name: "Đang chuẩn bị nội dung (1)" });
    await expect(pending.getByRole("link", { name: new RegExp(a!.lemma) })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pending.getByText(`đã vào “${notebook.name}” · chạm để xem`)).toBeVisible();

    // Trang sổ tay cũng hiện danh sách của sổ đó.
    await page.goto(`/notebooks/${notebook.id}`);
    await expect(page.getByRole("region", { name: "Đang chuẩn bị nội dung (1)" })).toBeVisible();
  });
});
