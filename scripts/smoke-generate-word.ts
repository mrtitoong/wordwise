/**
 * Chạy thử Edge Function generate-word và word-media trên Supabase cục bộ (job CI "functions"): kiểm tra
 * bundle chạy được trong Deno thật, gọi được các hàm SQL, đăng nhập và RLS đúng.
 * Không có khóa LLM nên chỉ kiểm tra tra kho / xếp việc, không tạo nội dung.
 *
 *   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… npx tsx scripts/smoke-generate-word.ts
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { SentenceAudioResponseSchema } from "@/lib/media/api";
import { WordResponseSchema, type WordResponse } from "@/lib/words/api";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Cần SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY");
const endpoint = `${url}/functions/v1/generate-word`;

let failures = 0;
function expect(condition: boolean, message: string, detail?: unknown) {
  console.log(`${condition ? "✓" : "✗"} ${message}`);
  if (!condition) {
    failures++;
    if (detail !== undefined) console.log("  ", JSON.stringify(detail));
  }
}

async function call(body: unknown, token = key!, headers: Record<string, string> = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function word(body: unknown, token?: string): Promise<WordResponse> {
  const { status, body: data } = await call(body, token);
  if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(data)}`);
  return WordResponseSchema.parse(data);
}

const ready = await word({ lemma: "Running" });
expect(
  ready.status === "ready" && ready.lemma === "run" && ready.words[0]?.content.lemma === "run",
  "Từ có trong kho (seed) → ready, đã đưa về dạng gốc",
  ready,
);

const guest = await word({ lemma: "zygote" });
expect(guest.status === "login_required", "Khách xin từ ngoài kho → login_required", guest);

const user = createClient<Database>(url, key, { auth: { persistSession: false } });
const { data: session, error } = await user.auth.signInWithPassword({
  email: "minh@wordwise.local",
  password: "wordwise-local-user",
});
if (error || !session.session) throw new Error(`Đăng nhập lỗi: ${error?.message}`);

const preparing = await word({ lemma: "Zygotes", pos: "noun" }, session.session.access_token);
expect(preparing.status === "preparing", "Người dùng xin từ mới → preparing", preparing);
if (preparing.status === "preparing") {
  const again = await word({ lemma: "zygote", pos: "noun" }, session.session.access_token);
  expect(
    again.status === "preparing" && again.jobId === preparing.jobId,
    "Gọi lại cùng từ → cùng việc",
    again,
  );
  const { data: jobs } = await user.from("word_jobs").select("id, lemma, status");
  expect(
    jobs?.length === 1 && jobs[0]?.id === preparing.jobId && jobs[0]?.lemma === "zygote",
    "Người dùng đọc được việc mình yêu cầu (RLS)",
    jobs,
  );
}

const worker = await call({ action: "work" }, key, { "x-worker-secret": "sai".repeat(20) });
expect(worker.status === 401, "Worker sai khóa → 401", worker);

const invalid = await call({ lemma: "" });
expect(invalid.status === 400, "Yêu cầu sai → 400", invalid);

/* ---------- word-media (Prompt 2.2) ---------- */

const mediaEndpoint = `${url}/functions/v1/word-media`;
async function media(body: unknown, token = key!, headers: Record<string, string> = {}) {
  const response = await fetch(mediaEndpoint, {
    method: "POST",
    headers: {
      apikey: key!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const { data: sense } = await user.from("word_senses").select("id").limit(1).single();
if (!sense) throw new Error("Seed không có word_senses");
const guestAudio = await media({ action: "sentence", senseId: sense.id, index: 0, voice: "us" });
expect(
  guestAudio.status === 200 &&
    SentenceAudioResponseSchema.parse(guestAudio.body).status === "login_required",
  "Khách xin audio câu chưa có → login_required",
  guestAudio,
);
const missing = await media({ action: "sentence", senseId: sense.id, index: 9, voice: "us" });
expect(
  missing.status === 200 && SentenceAudioResponseSchema.parse(missing.body).status === "not_found",
  "Câu không tồn tại → not_found",
  missing,
);
const mediaWorker = await media({ action: "work" }, key, { "x-worker-secret": "sai".repeat(20) });
expect(mediaWorker.status === 401, "Worker media sai khóa → 401", mediaWorker);

if (failures > 0) {
  console.error(`${failures} kiểm tra lỗi`);
  process.exit(1);
}
