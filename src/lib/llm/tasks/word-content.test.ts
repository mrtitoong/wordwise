import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePromptTemplate, renderTemplate } from "../prompt-template";
import { buildWordContentPrompt } from "./word-content";

const markdown = readFileSync(new URL("../../../prompts/word-content.md", import.meta.url), "utf8");
const template = parsePromptTemplate(markdown);

describe("prompt word-content", () => {
  it("đọc được phần đầu, system và user", () => {
    expect(template.task).toBe("word-content");
    expect(template.version).toBe(3);
    expect(template.system).toContain("JSON");
    expect(template.user).toContain("{{lemma}}");
    expect(template.system).not.toContain("=== USER ===");
  });

  it("điền đủ biến, không còn {{…}}", () => {
    const { system, prompt, promptVersion } = buildWordContentPrompt(template, {
      language: "en",
      lemma: " resilient ",
      pos: "adjective",
      cefrLevel: "B1",
    });
    expect(promptVersion).toBe(3);
    expect(prompt).toContain(`pos = "adjective".`);
    expect(system).toContain("tiếng Anh");
    expect(prompt).toContain('"resilient"');
    expect(prompt).toContain("B1");
    expect(`${system}${prompt}`).not.toMatch(/\{\{|\}\}/);
  });

  it("không bao giờ đưa câu ngữ cảnh của người dùng vào prompt", () => {
    const secret = "Hôm qua sếp tôi ở công ty ABC nói tôi rất resilient";
    const { system, prompt } = buildWordContentPrompt(template, {
      language: "en",
      lemma: "resilient",
      pos: null,
      cefrLevel: "B2",
      contextSentence: secret,
    });
    expect(system + prompt).not.toContain(secret);
    expect(system + prompt).not.toContain("ABC");
    expect(prompt).toContain("chọn MỘT loại từ phổ biến nhất");
  });

  it("giữ ký tự đặc biệt trong dữ liệu từ điển", () => {
    const { prompt } = buildWordContentPrompt(template, {
      language: "en",
      lemma: "run",
      pos: "verb",
      cefrLevel: "A2",
      dictionary: { note: "$& {{lemma}}" },
    });
    expect(prompt).toContain('{"note":"$& {{lemma}}"}');
  });
});

describe("renderTemplate", () => {
  it("thiếu biến thì báo lỗi", () => {
    expect(() => renderTemplate("Xin chào {{name}}", {})).toThrow("{{name}}");
  });
});

describe("parsePromptTemplate", () => {
  it("thiếu phần đầu thì báo lỗi", () => {
    expect(() => parsePromptTemplate("=== SYSTEM ===\na\n=== USER ===\nb")).toThrow();
  });

  it("chấp nhận xuống dòng kiểu Windows", () => {
    const t = parsePromptTemplate(
      "---\r\ntask: x\r\nversion: 2\r\n---\r\n=== SYSTEM ===\r\ns\r\n=== USER ===\r\nu\r\n",
    );
    expect(t).toEqual({ task: "x", version: 2, system: "s", user: "u" });
  });
});
