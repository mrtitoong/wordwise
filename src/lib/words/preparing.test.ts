import { describe, expect, it } from "vitest";
import { DONE_VISIBLE_MS, justFinished, preparingItems } from "./preparing";

const NOW = new Date("2026-10-26T05:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function row(
  job: string,
  status: string,
  { finished = null as string | null, created = ago(60_000), notebook = "nb-1" } = {},
) {
  return {
    job_id: job,
    notebook_id: notebook,
    created_at: created,
    word_jobs: {
      lemma: `w-${job}`,
      status,
      finished_at: finished,
      word_id: status === "done" ? `word-${job}` : null,
    },
  };
}

describe("preparingItems", () => {
  it("trạng thái theo việc; đang chuẩn bị trước, rồi lỗi, rồi đã xong; mới trước", () => {
    const items = preparingItems(
      [
        row("a", "done", { finished: ago(60_000) }),
        row("b", "failed", { finished: ago(60_000) }),
        row("c", "queued", { created: ago(120_000) }),
        row("d", "running", { created: ago(10_000) }),
      ],
      NOW,
    );
    expect(items.map((i) => [i.jobId, i.state])).toEqual([
      ["d", "preparing"],
      ["c", "preparing"],
      ["b", "failed"],
      ["a", "done"],
    ]);
    expect(items.find((i) => i.jobId === "a")).toMatchObject({ wordId: "word-a", lemma: "w-a" });
  });

  it("từ đã xong quá 10 phút thì ẩn; dòng sai dạng hoặc trạng thái lạ thì bỏ", () => {
    const items = preparingItems(
      [
        row("old", "done", { finished: ago(DONE_VISIBLE_MS + 1) }),
        row("new", "done", { finished: ago(DONE_VISIBLE_MS - 1) }),
        row("odd", "paused"),
        { job_id: "bad" },
      ],
      NOW,
    );
    expect(items.map((i) => i.jobId)).toEqual(["new"]);
    expect(preparingItems(null, NOW)).toEqual([]);
  });

  it("justFinished: chỉ khi một việc đang chuẩn bị chuyển sang đã xong", () => {
    const before = preparingItems([row("a", "running"), row("b", "failed")], NOW);
    const done = preparingItems(
      [row("a", "done", { finished: ago(1000) }), row("b", "failed")],
      NOW,
    );
    expect(justFinished(before, done)).toBe(true);
    expect(justFinished(done, done)).toBe(false);
    expect(justFinished(before, before)).toBe(false);
  });
});
