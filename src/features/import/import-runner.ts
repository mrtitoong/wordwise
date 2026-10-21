"use client";

/**
 * Chạy việc nhập từ file trong nền (một tab một lúc nhờ Web Locks): từ có trong kho ghi vào máy
 * theo lô 50, từ mới gửi máy chủ tạo nội dung từng từ (tự vào sổ khi xong). Tiến độ lưu trong
 * bảng Dexie `imports` sau mỗi lô và cập nhật import_jobs trên máy chủ.
 */
import { showToast } from "@/components/ui/toast";
import { getLocalDb, type LocalDb } from "@/lib/db/local";
import { addSensesToNotebook } from "@/lib/db/repo";
import {
  importProgress,
  isRunnable,
  nextBatch,
  nextVietnamDay,
  type ImportRecord,
} from "@/lib/entry/import-record";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { requestWord } from "@/lib/words/request-word";
import { cacheSenses } from "@/features/add-word/word-search";

type Messages = {
  done: (record: ImportRecord) => string;
  waiting: (record: ImportRecord) => string;
};

let messages: Messages | null = null;
let running = false;

/** Chuỗi thông báo theo ngôn ngữ giao diện (ImportProvider đặt khi khởi động). */
export function setImportMessages(value: Messages) {
  messages = value;
}

async function save(db: LocalDb, record: ImportRecord) {
  record.updatedAt = new Date().toISOString();
  await db.imports.put(record);
}

/** Cập nhật import_jobs (không chặn nếu lỗi mạng). */
async function reportServer(record: ImportRecord) {
  if (!record.serverJobId || !getSupabaseEnv()) return;
  const progress = importProgress(record);
  const status =
    record.status === "done" ? "succeeded" : record.status === "failed" ? "failed" : "running";
  await createClient()
    .from("import_jobs")
    .update({ status, total: progress.total, done: progress.done })
    .eq("id", record.serverJobId)
    .then(
      () => undefined,
      () => undefined,
    );
}

async function runOne(db: LocalDb, record: ImportRecord) {
  for (;;) {
    const batch = nextBatch(record);
    if (!batch) {
      record.status = "done";
      record.reason = null;
      record.resumeAfter = null;
      await save(db, record);
      await reportServer(record);
      if (messages) showToast({ text: messages.done(record) });
      return;
    }

    if (batch.kind === "known") {
      const items = batch.indexes.map((i) => record.items[i]!);
      const result = await addSensesToNotebook(
        db,
        record.owner,
        items.map((item) => ({
          senseId: item.senseId!,
          contextSentence: item.context,
          tags: item.tags,
          note: item.note,
        })),
        { notebookId: record.notebookId, inputMethod: "csv", source: record.fileName },
      );
      const skipped = new Set(result.skipped);
      for (const item of items) item.state = skipped.has(item.senseId!) ? "skipped" : "added";
      void cacheSenses(
        db,
        items.map((i) => i.senseId!),
      );
    } else {
      const item = record.items[batch.index]!;
      let response;
      try {
        response = await requestWord(createClient(), {
          lemma: item.lemma,
          notebookId: record.notebookId,
          contextSentence: item.context,
          inputMethod: "csv",
          note: item.note,
          tags: item.tags,
        });
      } catch {
        // Mất mạng/lỗi máy chủ: dừng, lần mở app sau chạy tiếp.
        await save(db, record);
        return;
      }
      if (response.status === "limit_reached") {
        record.status = "waiting";
        record.reason = "limit";
        record.resumeAfter = nextVietnamDay(new Date()).toISOString();
        await save(db, record);
        await reportServer(record);
        if (messages) showToast({ text: messages.waiting(record) });
        return;
      }
      if (response.status === "premium_required") {
        record.status = "failed";
        record.reason = "premium";
        for (const it of record.items) if (it.state === "pending") it.state = "failed";
        await save(db, record);
        await reportServer(record);
        return;
      }
      if (response.status === "ready") {
        const senseId = response.words[0]!.senseIds[0]!;
        const result = await addSensesToNotebook(
          db,
          record.owner,
          [{ senseId, contextSentence: item.context, tags: item.tags, note: item.note }],
          { notebookId: record.notebookId, inputMethod: "csv", source: record.fileName },
        );
        item.senseId = senseId;
        item.state = result.skipped.length ? "skipped" : "added";
        void cacheSenses(db, [senseId]);
      } else {
        item.state = response.status === "preparing" ? "preparing" : "failed";
      }
    }
    await save(db, record);
    await reportServer(record);
  }
}

/** Chạy các việc nhập của người dùng này đến khi xong, hết lượt hoặc mất mạng. */
export async function runImports(owner: string): Promise<void> {
  if (running || typeof window === "undefined") return;
  running = true;
  const work = async () => {
    const db = getLocalDb();
    const tried = new Set<string>();
    // Lấy lại danh sách sau mỗi việc: việc mới tạo trong lúc đang chạy cũng được làm luôn.
    for (;;) {
      const records = await db.imports.where("owner").equals(owner).toArray();
      const record = records
        .filter((r) => !tried.has(r.id) && isRunnable(r, new Date()))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!record) return;
      tried.add(record.id);
      record.status = "running";
      await runOne(db, record);
    }
  };
  try {
    if (navigator.locks)
      await navigator.locks.request("wordwise-import", { ifAvailable: true }, (lock) =>
        lock ? work() : undefined,
      );
    else await work();
  } catch (error) {
    console.error("Nhập file lỗi:", error);
  } finally {
    running = false;
  }
}

/** Tạo việc nhập (kèm import_jobs trên máy chủ nếu được) rồi chạy ngay. */
export async function startImport(
  record: Omit<
    ImportRecord,
    "serverJobId" | "createdAt" | "updatedAt" | "status" | "reason" | "resumeAfter"
  >,
): Promise<void> {
  const now = new Date().toISOString();
  let serverJobId: string | null = null;
  if (getSupabaseEnv()) {
    const { data } = await createClient()
      .from("import_jobs")
      .insert({ user_id: record.owner, kind: "csv", status: "running", total: record.items.length })
      .select("id")
      .single()
      .then(
        (r) => r,
        () => ({ data: null }),
      );
    serverJobId = data?.id ?? null;
  }
  await getLocalDb().imports.put({
    ...record,
    serverJobId,
    status: "running",
    reason: null,
    resumeAfter: null,
    createdAt: now,
    updatedAt: now,
  });
  void runImports(record.owner);
}
