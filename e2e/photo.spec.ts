import { expect, test, type Page } from "@playwright/test";
import {
  completeOnboarding,
  hasSupabase,
  readLocalStore,
  serverAdmin,
  signInWithCode,
  uniqueEmail,
  userIdByEmail,
} from "./helpers";

const TEXT =
  "Resilient people do not see setbacks as proof of failure. They are tenacous and persevere.";

/** Tài liệu OCR giả: mỗi từ một khung, xếp 6 từ một dòng (vị trí không cần khớp ảnh thật). */
function fakeDocument() {
  const parts = TEXT.match(/[A-Za-z]+|[.]/g)!;
  let sentence = 0;
  let word = 0;
  return {
    source: "vision",
    meanConfidence: 0.97,
    skewDegrees: 0.5,
    tokens: parts.map((text, i) => {
      const isWord = /[A-Za-z]/.test(text);
      const slot = isWord ? word++ : word - 1;
      const token = {
        text,
        kind: isWord ? "word" : "punct",
        boxes: isWord
          ? [{ x: 0.05 + (slot % 6) * 0.15, y: 0.1 + Math.floor(slot / 6) * 0.1, w: 0.13, h: 0.06 }]
          : [],
        confidence: isWord ? 0.97 : null,
        spaceBefore: i > 0 && isWord,
        paragraph: 0,
        sentence,
      };
      if (text === ".") sentence++;
      return token;
    }),
  };
}

/** Từ trong kho (seed) dùng cho tra từ giả; từ thường gặp cho CEFR A1 (không tự chọn). */
const LIBRARY: Record<
  string,
  { lemma: string; cefr: string; senses: [string, string][] } | undefined
> = {
  resilient: {
    lemma: "resilient",
    cefr: "C1",
    senses: [
      ["51c8ac6a-0d9c-41f6-833e-7ec0dda38a1d", "kiên cường"],
      ["b7b69480-9d73-4625-9deb-3e7d4d2d2235", "đàn hồi"],
    ],
  },
  setbacks: {
    lemma: "setback",
    cefr: "C1",
    senses: [["9e0a3013-a304-4fa6-8e72-14caca72f4cf", "sự thụt lùi"]],
  },
  tenacious: {
    lemma: "tenacious",
    cefr: "C2",
    senses: [["e94c4fec-fe93-4f4d-9c96-8b80e0490084", "kiên trì"]],
  },
};
const COMMON = new Set(["people", "see", "proof", "failure", "they", "are", "and"]);

async function mockFunctions(page: Page) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/ocr-image", (route) =>
    route.fulfill({ json: { status: "ok", document: fakeDocument() } }),
  );
  await page.route("**/functions/v1/generate-word", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    if (body.action === "resolve") {
      const items = (body.lemmas as string[]).map((input) => {
        const known = LIBRARY[input];
        if (known) {
          return {
            input,
            lemma: known.lemma,
            alternatives: [],
            words: [
              {
                id: `w-${known.lemma}`,
                lemma: known.lemma,
                pos: "adjective",
                cefr: known.cefr,
                senses: known.senses.map(([id, meaning_vi]) => ({ id, meaning_vi })),
              },
            ],
          };
        }
        if (COMMON.has(input)) {
          return {
            input,
            lemma: input,
            alternatives: [],
            words: [
              {
                id: `w-${input}`,
                lemma: input,
                pos: "noun",
                cefr: "A1",
                senses: [{ id: `common-${input}`, meaning_vi: input }],
              },
            ],
          };
        }
        return { input, lemma: input, alternatives: [], words: [] };
      });
      return route.fulfill({ json: { items } });
    }
    return route.fulfill({
      json: { status: "preparing", lemma: body.lemma, alternatives: [], jobId: "job-1" },
    });
  });
  return requests;
}

test.describe("Thêm từ bằng ảnh chụp", () => {
  test.skip(!hasSupabase, "cần Supabase cục bộ (chạy trong CI)");

  test("khách được mời đăng nhập", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: "Dùng thử ngay" }).click();
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");
    await page.getByRole("tab", { name: "Ảnh" }).click();
    await expect(page.getByText("Đăng nhập để thêm từ bằng ảnh chụp.")).toBeVisible();
  });

  test("Premium: chụp → đọc chữ → tự chọn → sửa chính tả → thêm với câu gốc", async ({ page }) => {
    const email = uniqueEmail("photo");
    await signInWithCode(page, email);
    await completeOnboarding(page, { level: "B1", starters: false });
    await expect(page).toHaveURL("/add");

    await page.getByRole("tab", { name: "Ảnh" }).click();
    await expect(
      page.getByRole("heading", { name: "Thêm từ bằng ảnh dành cho Premium" }),
    ).toBeVisible();

    const admin = serverAdmin();
    test.skip(!admin, "cần E2E_SUPABASE_SECRET_KEY để bật Premium");
    await admin!
      .from("profiles")
      .update({ plan: "premium" })
      .eq("user_id", await userIdByEmail(email));

    const requests = await mockFunctions(page);
    await page.reload();
    await page.getByRole("tab", { name: "Ảnh" }).click();
    await page.getByTestId("photo-file").setInputFiles("tests/fixtures/ocr/print-clear.jpg");

    // Chỉnh ảnh: xoay đi rồi xoay lại, đọc chữ.
    await page.getByRole("button", { name: "Xoay phải" }).click();
    await page.getByRole("button", { name: "Xoay trái" }).click();
    await page.getByRole("button", { name: "Đọc chữ" }).click();

    // Màn chọn từ: chạm một từ, rồi Tự chọn từ mới.
    const image = page.getByLabel("Ảnh đã đọc chữ, chạm vào từ để chọn");
    await expect(image).toBeVisible();
    await image.getByRole("button", { name: "proof", exact: true }).click();
    await expect(page.getByText("Đã chọn 1")).toBeVisible();
    await image.getByRole("button", { name: "proof", exact: true }).click();
    await expect(page.getByText("Đã chọn 0")).toBeVisible();

    await page.getByRole("button", { name: "Tự chọn từ mới" }).click();
    const chips = page.getByRole("list", { name: "Các từ đã chọn" }).getByRole("button");
    await expect(chips).toHaveText(["resilient", "setbacks", "tenacous", "persevere"]);

    // Dạng chữ: kéo ngang để chọn cụm "proof of failure".
    await page.getByRole("radio", { name: "Chữ" }).click();
    const text = page.getByLabel("Chữ đọc được trên ảnh, chạm vào từ để chọn");
    const from = await text.getByRole("button", { name: "proof", exact: true }).boundingBox();
    const to = await text.getByRole("button", { name: "failure", exact: true }).boundingBox();
    await page.mouse.move(from!.x + 5, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + 40, from!.y + from!.height / 2, { steps: 4 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(chips).toHaveText([
      "resilient",
      "setbacks",
      "proof of failure",
      "tenacous",
      "persevere",
    ]);
    await page.getByRole("button", { name: "Bỏ “proof of failure”" }).click();

    // Kiểm tra: từ gốc, gợi ý chính tả, chọn nghĩa, thêm.
    await page.getByRole("button", { name: "Tiếp: kiểm tra 4 từ" }).click();
    await expect(page.getByRole("heading", { name: "Kiểm tra 4 từ" })).toBeVisible();
    await expect(page.getByText("từ “setbacks” → setback")).toBeVisible();
    await page.getByRole("button", { name: /Có phải tenacious\?/ }).click();
    await expect(page.getByLabel("Từ thứ 3")).toHaveValue("tenacious");
    await expect(page.getByRole("button", { name: "2 nghĩa · chọn" })).toBeVisible();

    await page.getByRole("button", { name: "Thêm 4 từ" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thêm 3 từ. 1 từ đang chuẩn bị nội dung." }),
    ).toBeVisible();

    const entries = await readLocalStore<{ input_method: string; context_sentence: string }>(
      page,
      "notebook_entries",
    );
    expect(entries.map((e) => e.input_method)).toEqual(["photo", "photo", "photo"]);
    expect(entries.map((e) => e.context_sentence).sort()).toEqual([
      "Resilient people do not see setbacks as proof of failure.",
      "Resilient people do not see setbacks as proof of failure.",
      "They are tenacous and persevere.",
    ]);
    const fresh = requests.find((r) => r.action === "request");
    expect(fresh).toMatchObject({
      lemma: "persevere",
      inputMethod: "photo",
      contextSentence: "They are tenacous and persevere.",
    });
  });
});
