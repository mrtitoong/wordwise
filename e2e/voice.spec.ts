import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, hasSupabase, readLocalStore } from "./helpers";

type Script = { results: { transcript: string; confidence: number }[][] } | { error: string };

/**
 * Giả lập Web Speech API: mỗi lần start() phát các kết quả trong window.__speech (hoặc lỗi)
 * rồi kết thúc. Trình duyệt headless không nhận dạng giọng nói thật.
 */
async function fakeSpeech(page: Page) {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const script = (window as unknown as { __speech: Script }).__speech;
        (window as unknown as { __speechLang: string }).__speechLang = this.lang;
        setTimeout(() => {
          if ("error" in script) this.onerror?.({ error: script.error });
          else {
            const results = script.results.map((alts) =>
              Object.assign([...alts], { isFinal: true }),
            );
            this.onresult?.({ resultIndex: 0, results });
          }
          this.onend?.();
        }, 200);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition });
  });
}

async function setScript(page: Page, script: Script) {
  await page.evaluate((s) => Object.assign(window, { __speech: s }), script);
}

async function openVoiceTab(page: Page) {
  await fakeSpeech(page);
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Dùng thử ngay" }).click();
  await completeOnboarding(page, { level: "B1", starters: false });
  await expect(page).toHaveURL("/add");
  await page.getByRole("tab", { name: "Nói" }).click();
}

test.describe("Thêm từ bằng giọng nói", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("nói → 3 phương án → chọn → thêm vào sổ với cách nhập giọng nói", async ({ page }) => {
    await openVoiceTab(page);
    await setScript(page, {
      results: [
        [
          { transcript: "Resilient.", confidence: 0.9 },
          { transcript: "resilience", confidence: 0.5 },
          { transcript: "resilient", confidence: 0.4 },
        ],
      ],
    });
    await page.getByRole("button", { name: /Micro/ }).click();
    const options = page.getByRole("list", { name: "Các phương án" }).getByRole("button");
    await expect(options).toHaveText(["resilient", "resilience"]);
    expect(
      await page.evaluate(() => (window as unknown as { __speechLang: string }).__speechLang),
    ).toBe("en-US");

    await options.first().click();
    await expect(page.getByText(/1 từ · học hôm nay/)).toBeVisible();
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã thêm “resilient”" })).toBeVisible();
    const entries = await readLocalStore<{ input_method: string }>(page, "notebook_entries");
    expect(entries.map((e) => e.input_method)).toEqual(["voice"]);
  });

  test("từ chối micro → hướng dẫn và nút Gõ thay thế; không nghe rõ → nhắc nói lại", async ({
    page,
  }) => {
    await openVoiceTab(page);
    await setScript(page, { error: "not-allowed" });
    await page.getByRole("button", { name: /Micro/ }).click();
    await expect(page.getByText("Chưa có quyền dùng micro.", { exact: false })).toBeVisible();

    await setScript(page, { error: "no-speech" });
    await page.getByRole("button", { name: /Micro/ }).click();
    await expect(page.getByText("Chưa nghe rõ", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Gõ thay thế" }).click();
    await expect(page.getByRole("tab", { name: "Gõ" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Từ cần thêm")).toBeVisible();
  });

  test("nói liên tục: mỗi lần nói thành một dòng, câu dài tách từng từ", async ({ page }) => {
    await openVoiceTab(page);
    await page.getByRole("checkbox", { name: "Nói liên tục nhiều từ" }).check();
    await setScript(page, {
      results: [
        [{ transcript: "give up", confidence: 0.9 }],
        [{ transcript: "tenacious hardy robust resilient", confidence: 0.9 }],
      ],
    });
    await page.getByRole("button", { name: /Micro/ }).click();
    await expect(page.getByRole("button", { name: /^Bỏ “/ })).toHaveCount(5);
    await page.getByRole("button", { name: "Bỏ “hardy”" }).click();
    await expect(page.getByRole("button", { name: "Xem trước và thêm 4 từ" })).toBeVisible();
  });
});
