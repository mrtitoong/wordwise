"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { RegenerateTab } from "@/lib/admin/review";
import {
  CefrSchema,
  PosSchema,
  RegisterSchema,
  WordContentSchema,
  type Pos,
  type Register,
  type WordContent,
} from "@/lib/schema/word";

type Mnemonic = WordContent["mnemonics"][number];
import { WORD_CARD_TABS } from "@/lib/words/word-card";

type Row = Record<string, string | null>;

type FieldKey =
  | "ipa_us"
  | "ipa_uk"
  | "cefr"
  | "register"
  | "definition_en"
  | "meaning_vi"
  | "image_query"
  | "sentence"
  | "translation_vi"
  | "highlight"
  | "pattern"
  | "phrase"
  | "example"
  | "wrong"
  | "correct"
  | "explanation_vi"
  | "word"
  | "nuance_vi"
  | "kind"
  | "pos"
  | "note_vi"
  | "type"
  | "text_vi"
  | "difference_vi"
  | "etymology_vi";

type Field = {
  key: FieldKey;
  kind: "text" | "textarea" | "select";
  options?: readonly string[];
  /** Để trống → null. */
  optional?: boolean;
};

const REGISTERS = RegisterSchema.options;
const input =
  "min-h-11 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/** Đường dẫn lỗi của Zod → chữ dễ đọc ("Nghĩa 1 · examples 2 · highlight"). */
function pathLabel(path: readonly PropertyKey[], senseLabel: (n: number) => string): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const next = path[i + 1];
    if (key === "senses" && typeof next === "number") {
      parts.push(senseLabel(next + 1));
      i++;
    } else if (typeof key === "string" && typeof next === "number") {
      parts.push(`${key} ${next + 1}`);
      i++;
    } else {
      parts.push(String(key));
    }
  }
  return parts.join(" · ");
}

/**
 * Form sửa nội dung từ dùng chung (5 tab như thẻ từ). Giữ nguyên chữ, loại từ, số nghĩa và dạng
 * từ; kiểm tra bằng WordContentSchema trước khi gửi (server kiểm tra lại).
 */
export function WordEditor({
  initial,
  initialTab,
  saving,
  onCancel,
  onSave,
}: {
  initial: WordContent;
  initialTab: RegenerateTab;
  saving: boolean;
  onCancel: () => void;
  onSave: (content: WordContent) => void;
}) {
  const t = useTranslations("admin.review");
  const tc = useTranslations("wordCard");
  const [content, setContent] = useState<WordContent>(initial);
  const [tab, setTab] = useState<RegenerateTab>(initialTab);
  const [error, setError] = useState<string | null>(null);

  const update = (fn: (draft: WordContent) => void) =>
    setContent((current) => {
      const next = structuredClone(current);
      fn(next);
      return next;
    });

  const submit = () => {
    const parsed = WordContentSchema.safeParse(content);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(`${pathLabel(issue.path, (n) => tc("senseN", { number: n }))}: ${issue.message}`);
      return;
    }
    setError(null);
    onSave(parsed.data);
  };

  const optionLabel = (key: FieldKey, value: string): string => {
    if (key === "register") return tc(`register.${value as Register}`);
    if (key === "pos") return tc(`pos.${value as Pos}`);
    if (key === "kind") return tc(`related.${value as "homograph" | "homophone"}`);
    if (key === "type") return tc(`memory.type.${value as Mnemonic["type"]}`);
    return value;
  };

  const renderField = (
    field: Field,
    value: string | null,
    onChange: (v: string | null) => void,
  ) => {
    const label = t(`fields.${field.key}`);
    const set = (v: string) => onChange(field.optional && v.trim() === "" ? null : v);
    return (
      <label key={field.key} className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {label}
          {field.optional && ` (${t("optional")})`}
        </span>
        {field.kind === "textarea" ? (
          <textarea
            className={input}
            rows={2}
            value={value ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        ) : field.kind === "select" ? (
          <select className={input} value={value ?? ""} onChange={(e) => set(e.target.value)}>
            {field.options!.map((o) => (
              <option key={o} value={o}>
                {optionLabel(field.key, o)}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={input}
            lang={field.key.startsWith("ipa") ? "en-fonipa" : undefined}
            value={value ?? ""}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </label>
    );
  };

  /** Danh sách mục cùng loại (ví dụ, collocation…): sửa, thêm, xóa trong giới hạn của schema. */
  const list = (
    title: string,
    rows: Row[],
    fields: Field[],
    limits: { min?: number; max: number },
    change: (rows: Row[]) => void,
  ) => (
    <section key={title} className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
      </h4>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 rounded-lg border p-2">
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            {fields.map((field) =>
              renderField(field, row[field.key] ?? null, (v) =>
                change(rows.map((r, j) => (j === i ? { ...r, [field.key]: v } : r))),
              ),
            )}
          </div>
          <button
            type="button"
            aria-label={t("removeEntry")}
            disabled={rows.length <= (limits.min ?? 0)}
            onClick={() => change(rows.filter((_, j) => j !== i))}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      {rows.length < limits.max && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 self-start"
          onClick={() =>
            change([
              ...rows,
              Object.fromEntries(
                fields.map((f) => [
                  f.key,
                  f.kind === "select" ? f.options![0]! : f.optional ? null : "",
                ]),
              ),
            ])
          }
        >
          <Plus aria-hidden />
          {t("addEntry")}
        </Button>
      )}
    </section>
  );

  type SenseKey =
    "examples" | "collocations" | "idioms" | "common_mistakes" | "synonyms" | "antonyms";
  type WordKey = "homonyms" | "word_family" | "mnemonics" | "confusables";

  const senseList = (
    i: number,
    key: SenseKey,
    fields: Field[],
    limits: { min?: number; max: number },
  ) =>
    list(
      t(`sections.${key}`),
      content.senses[i]![key] as unknown as Row[],
      fields,
      limits,
      (rows) =>
        update((d) => {
          (d.senses[i] as Record<string, unknown>)[key] = rows;
        }),
    );

  const wordList = (key: WordKey, fields: Field[], max: number) =>
    list(t(`sections.${key}`), content[key] as unknown as Row[], fields, { max }, (rows) =>
      update((d) => {
        (d as Record<string, unknown>)[key] = rows;
      }),
    );

  const perSense = (render: (i: number) => ReactNode) =>
    content.senses.map((sense, i) => (
      <fieldset key={i} className="flex flex-col gap-3 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">
          {tc("senseHeading", { number: i + 1, meaning: sense.meaning_vi })}
        </legend>
        {render(i)}
      </fieldset>
    ));

  const text = (key: FieldKey, optional = false): Field => ({ key, kind: "text", optional });
  const area = (key: FieldKey, optional = false): Field => ({ key, kind: "textarea", optional });
  const select = (key: FieldKey, options: readonly string[]): Field => ({
    key,
    kind: "select",
    options,
  });

  return (
    <div className="flex flex-col gap-4">
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as RegenerateTab)}>
        <Tabs.List aria-label={tc("tabsLabel")} className="grid grid-cols-5 border-b">
          {WORD_CARD_TABS.map((id) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="flex min-h-11 items-center justify-center border-b-2 border-transparent px-0.5 text-center text-[13px] text-muted-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-accent-foreground"
            >
              {tc(`tabs.${id}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="meaning" className="flex flex-col gap-3 pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {renderField(text("ipa_us", true), content.ipa.us, (v) =>
              update((d) => {
                d.ipa.us = v;
              }),
            )}
            {renderField(text("ipa_uk", true), content.ipa.uk, (v) =>
              update((d) => {
                d.ipa.uk = v;
              }),
            )}
            {renderField(select("cefr", CefrSchema.options), content.cefr, (v) =>
              update((d) => {
                d.cefr = v as WordContent["cefr"];
              }),
            )}
            {renderField(select("register", REGISTERS), content.register, (v) =>
              update((d) => {
                d.register = v as WordContent["register"];
              }),
            )}
          </div>
          {perSense((i) =>
            (["meaning_vi", "definition_en", "image_query"] as const).map((key) =>
              renderField(
                key === "definition_en" ? area(key) : text(key),
                content.senses[i]![key],
                (v) =>
                  update((d) => {
                    d.senses[i]![key] = v ?? "";
                  }),
              ),
            ),
          )}
        </Tabs.Content>

        <Tabs.Content value="examples" className="flex flex-col gap-3 pt-4">
          {perSense((i) =>
            senseList(
              i,
              "examples",
              [area("sentence"), area("translation_vi"), text("highlight")],
              { min: 1, max: 5 },
            ),
          )}
        </Tabs.Content>

        <Tabs.Content value="usage" className="flex flex-col gap-3 pt-4">
          {perSense((i) => (
            <>
              {senseList(
                i,
                "collocations",
                [text("pattern"), text("phrase"), area("example", true)],
                {
                  max: 8,
                },
              )}
              {senseList(
                i,
                "idioms",
                [
                  text("phrase"),
                  text("meaning_vi"),
                  select("register", REGISTERS),
                  area("example", true),
                ],
                { max: 6 },
              )}
              {senseList(
                i,
                "common_mistakes",
                [text("wrong"), text("correct"), area("explanation_vi")],
                { max: 3 },
              )}
            </>
          ))}
        </Tabs.Content>

        <Tabs.Content value="related" className="flex flex-col gap-3 pt-4">
          {perSense((i) => (
            <>
              {senseList(i, "synonyms", [text("word"), area("nuance_vi")], { max: 8 })}
              {senseList(i, "antonyms", [text("word")], { max: 6 })}
            </>
          ))}
          {wordList(
            "homonyms",
            [text("word"), select("kind", ["homograph", "homophone"]), text("meaning_vi")],
            4,
          )}
          {wordList(
            "word_family",
            [text("word"), select("pos", PosSchema.options), text("note_vi", true)],
            10,
          )}
        </Tabs.Content>

        <Tabs.Content value="memory" className="flex flex-col gap-3 pt-4">
          {wordList(
            "mnemonics",
            [select("type", ["sound", "etymology", "image", "story"]), area("text_vi")],
            3,
          )}
          {wordList("confusables", [text("word"), area("difference_vi")], 4)}
          {renderField(area("etymology_vi", true), content.etymology_vi, (v) =>
            update((d) => {
              d.etymology_vi = v;
            }),
          )}
        </Tabs.Content>
      </Tabs.Root>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("invalid", { detail: error })}
        </p>
      )}
      <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
        <Button type="button" className="min-h-11" disabled={saving} onClick={submit}>
          {saving ? tc("saving") : t("saveShared")}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
}
