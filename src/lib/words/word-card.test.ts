import { describe, expect, it } from "vitest";
import type { NotebookEntryRow, NotebookRow, UserWordRow } from "@/lib/db/types";
import { loadExampleWords } from "@/lib/schema/examples";
import type { WordContent } from "@/lib/schema/word";
import type { StoredWord } from "./api";
import { buildWordCard, sourceLabel, visibleTabs } from "./word-card";

const OWNER = "11111111-1111-4111-8111-111111111111";
const words = loadExampleWords();
const byLemma = (lemma: string) => words.find((w) => w.lemma === lemma)!;

function stored(content: WordContent, images: StoredWord["media"]["images"] = []): StoredWord {
  return {
    id: `word-${content.lemma}`,
    senseIds: content.senses.map((_, i) => `sense-${content.lemma}-${i}`),
    content,
    media: { audio: { us: "https://a/us.mp3", uk: null }, images },
  };
}

const ISO = "2026-10-21T00:00:00.000Z";

function userWord(senseId: string, patch: Partial<UserWordRow> = {}): UserWordRow {
  return {
    id: `uw-${senseId}`,
    user_id: OWNER,
    sense_id: senseId,
    custom_meaning: null,
    custom_note: null,
    custom_image_url: null,
    user_additions: {},
    status: "queued",
    introduced_at: null,
    added_at: ISO,
    deleted_at: null,
    created_at: ISO,
    updated_at: ISO,
    ...patch,
  };
}

function entry(userWordId: string, patch: Partial<NotebookEntryRow> = {}): NotebookEntryRow {
  return {
    id: `entry-${userWordId}-${patch.notebook_id ?? "nb"}`,
    user_id: OWNER,
    notebook_id: "nb",
    user_word_id: userWordId,
    input_method: "typed",
    context_sentence: null,
    context_image_url: null,
    source_url: null,
    source_title: null,
    source: null,
    tags: [],
    added_at: ISO,
    deleted_at: null,
    created_at: ISO,
    updated_at: ISO,
    ...patch,
  };
}

function notebook(id: string, name: string): NotebookRow {
  return {
    id,
    user_id: OWNER,
    name,
    language: "en",
    description: null,
    cover_url: null,
    tags: [],
    source_list_id: null,
    source_list_version: null,
    target_date: null,
    is_archived: false,
    deleted_at: null,
    created_at: ISO,
    updated_at: ISO,
  };
}

const none = { userWords: [], entries: [], notebooks: [] };

describe("buildWordCard", () => {
  it("từ chưa có trong sổ: không có nội dung riêng, nghĩa 1 là nghĩa chính", () => {
    const word = stored(byLemma("resilient"));
    const view = buildWordCard(word, none);
    expect(view.inNotebook).toBe(false);
    expect(view.primaryUserWordId).toBeNull();
    expect(view.primarySenseId).toBe(word.senseIds[0]);
    expect(view.senses.map((s) => s.number)).toEqual(word.senseIds.map((_, i) => i + 1));
    expect(view.senses.every((s) => s.userWordId === null)).toBe(true);
    expect(view.inflections).toEqual(word.content.forms.inflections.map((i) => i.form));
    expect(view.highlightTerms).toContain("resilient");
  });

  it("nghĩa chính là nghĩa đầu tiên người dùng có; nghĩa tự đặt và ảnh tự đặt", () => {
    const bank = byLemma("bank");
    const word = stored(bank, [
      {
        url: "https://img/0.jpg",
        credit: { provider: "pexels", author: "A", author_url: "u", source_url: "s" },
      },
      null,
    ]);
    const second = word.senseIds[1]!;
    const view = buildWordCard(word, {
      userWords: [
        userWord(second, {
          custom_meaning: "  bờ sông  ",
          custom_image_url: `storage://user-images/${OWNER}/x.webp`,
        }),
      ],
      entries: [],
      notebooks: [],
    });
    expect(view.inNotebook).toBe(true);
    expect(view.primarySenseId).toBe(second);
    expect(view.primaryUserWordId).toBe(`uw-${second}`);
    expect(view.senses[1]!.customMeaning).toBe("bờ sông");
    expect(view.senses[0]!.customMeaning).toBeNull();
    expect(view.image).toEqual({
      kind: "custom",
      path: `storage://user-images/${OWNER}/x.webp`,
      userWordId: `uw-${second}`,
    });
  });

  it("không có ảnh tự đặt: ảnh của nghĩa chính, không có thì nghĩa khác có ảnh", () => {
    const bank = byLemma("bank");
    const credit = { provider: "unsplash" as const, author: "B", author_url: "u", source_url: "s" };
    const word = stored(bank, [{ url: "https://img/0.jpg", credit }, null]);
    const view = buildWordCard(word, {
      userWords: [userWord(word.senseIds[1]!)],
      entries: [],
      notebooks: [],
    });
    expect(view.image).toEqual({ kind: "stock", url: "https://img/0.jpg", credit });
    expect(buildWordCard(stored(bank, [null, null]), none).image).toBeNull();
  });

  it("bỏ qua dòng đã xóa và nghĩa của từ khác", () => {
    const word = stored(byLemma("resilient"));
    const view = buildWordCard(word, {
      userWords: [
        userWord(word.senseIds[0]!, { deleted_at: ISO }),
        userWord("sense-of-another-word"),
      ],
      entries: [],
      notebooks: [],
    });
    expect(view.inNotebook).toBe(false);
  });

  it("sổ chứa từ (bỏ sổ đã xóa) và câu gốc mới nhất trước, không trùng", () => {
    const word = stored(byLemma("resilient"));
    const uw = userWord(word.senseIds[0]!);
    const view = buildWordCard(word, {
      userWords: [uw],
      entries: [
        entry(uw.id, {
          notebook_id: "b",
          context_sentence: "Old sentence with resilient.",
          added_at: "2026-10-01T00:00:00Z",
        }),
        entry(uw.id, {
          notebook_id: "a",
          context_sentence: "New resilient sentence.",
          context_image_url: "https://img/page.jpg",
          source: "Grit",
          added_at: "2026-10-20T00:00:00Z",
        }),
        entry(uw.id, {
          notebook_id: "c",
          context_sentence: "New resilient sentence.",
          added_at: "2026-10-10T00:00:00Z",
        }),
        entry(uw.id, { notebook_id: "gone", deleted_at: ISO, context_sentence: "Deleted." }),
      ],
      notebooks: [
        notebook("a", "IELTS"),
        notebook("b", "Đọc sách"),
        notebook("c", "Công việc"),
        notebook("gone", "Xóa"),
      ],
    });
    expect(view.notebooks.map((n) => n.name)).toEqual(["Công việc", "Đọc sách", "IELTS"]);
    expect(view.contextSentences.map((c) => c.sentence)).toEqual([
      "New resilient sentence.",
      "Old sentence with resilient.",
    ]);
    expect(view.contextSentences[0]).toMatchObject({
      imageUrl: "https://img/page.jpg",
      source: "Grit",
      senseId: word.senseIds[0],
    });
  });
});

describe("visibleTabs", () => {
  const bare = (content: WordContent): WordContent => ({
    ...content,
    etymology_vi: null,
    homonyms: [],
    word_family: [],
    mnemonics: [],
    confusables: [],
    senses: content.senses.map((s) => ({
      ...s,
      synonyms: [],
      antonyms: [],
      collocations: [],
      idioms: [],
      common_mistakes: [],
    })),
  });

  it("từ đầy đủ hiện cả 5 tab", () => {
    const view = buildWordCard(stored(byLemma("resilient")), none);
    expect(view.tabs).toEqual(["meaning", "examples", "usage", "related", "memory"]);
  });

  it("ẩn tab rỗng (Nghĩa luôn hiện, Ví dụ luôn có vì mỗi nghĩa có ≥ 1 câu)", () => {
    const content = bare(byLemma("resilient"));
    const view = buildWordCard(stored(content), none);
    expect(view.tabs).toEqual(["meaning", "examples"]);
  });

  it("tab chỉ có nội dung của người dùng vẫn hiện", () => {
    const content = bare(byLemma("resilient"));
    const word = stored(content);
    const view = buildWordCard(word, {
      userWords: [
        userWord(word.senseIds[0]!, {
          user_additions: {
            usage: [{ id: "1", phrase: "emotionally resilient", note: null }],
            memory: [{ id: "2", text: "Cây tre" }],
          },
        }),
      ],
      entries: [],
      notebooks: [],
    });
    expect(view.tabs).toEqual(["meaning", "examples", "usage", "memory"]);
    expect(visibleTabs(content, view.senses, 0)).toEqual(view.tabs);
  });
});

describe("sourceLabel", () => {
  it("ẩn mã nội bộ, giữ tên nguồn đọc được", () => {
    expect(sourceLabel("paste")).toBeNull();
    expect(sourceLabel("pending")).toBeNull();
    expect(sourceLabel("starter")).toBeNull();
    expect(sourceLabel("list:1c2d")).toBeNull();
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("ielts-words.xlsx")).toBe("ielts-words.xlsx");
  });
});
