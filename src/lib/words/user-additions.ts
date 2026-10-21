/**
 * Nội dung người dùng tự thêm vào thẻ từ, lưu trong user_words.user_additions (JSONB),
 * một user_words cho mỗi nghĩa. Chia theo tab của thẻ từ; nội dung gốc chỉ đọc.
 *
 * Hàm thuần, không phụ thuộc React: thêm/sửa/xóa trả về object mới để ghi qua repo.
 * Dữ liệu cũ hoặc hỏng (máy khác ghi sai) không làm vỡ thẻ: mục sai bị bỏ qua.
 */
import { z } from "zod";
import type { Json } from "@/lib/db/database.types";

export const ADDITION_LAYERS = ["meaning", "examples", "usage", "related", "memory"] as const;
export type AdditionLayer = (typeof ADDITION_LAYERS)[number];

/** Số mục tối đa mỗi tab của một nghĩa. */
export const MAX_ITEMS_PER_LAYER = 20;

export const ADDITION_LIMITS = {
  sentence: 300,
  translation: 300,
  phrase: 100,
  word: 64,
  note: 300,
  text: 500,
} as const;

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

/** Ghi chú ở tab Nghĩa. */
export const NoteAdditionSchema = z.object({ id, text: text(ADDITION_LIMITS.text) });

export const ExampleAdditionSchema = z.object({
  id,
  sentence: text(ADDITION_LIMITS.sentence),
  translation_vi: optionalText(ADDITION_LIMITS.translation),
});

/** Cụm từ hay đi cùng (collocation, thành ngữ…) ở tab Cách dùng. */
export const UsageAdditionSchema = z.object({
  id,
  phrase: text(ADDITION_LIMITS.phrase),
  note: optionalText(ADDITION_LIMITS.note),
});

export const RelatedAdditionSchema = z.object({
  id,
  word: text(ADDITION_LIMITS.word),
  note: optionalText(ADDITION_LIMITS.note),
});

/** Mẹo nhớ ở tab Ghi nhớ. */
export const MemoryAdditionSchema = z.object({ id, text: text(ADDITION_LIMITS.text) });

const ITEM_SCHEMAS = {
  meaning: NoteAdditionSchema,
  examples: ExampleAdditionSchema,
  usage: UsageAdditionSchema,
  related: RelatedAdditionSchema,
  memory: MemoryAdditionSchema,
} as const;

export type AdditionItem<L extends AdditionLayer> = z.infer<(typeof ITEM_SCHEMAS)[L]>;
/** Dữ liệu nhập (chưa có id). */
export type AdditionInput<L extends AdditionLayer> = Omit<z.input<(typeof ITEM_SCHEMAS)[L]>, "id">;

export type UserAdditions = { [L in AdditionLayer]: AdditionItem<L>[] };

export function emptyAdditions(): UserAdditions {
  return { meaning: [], examples: [], usage: [], related: [], memory: [] };
}

/** Đọc user_additions từ database/Dexie; mục không hợp lệ bị bỏ qua. */
export function parseUserAdditions(value: unknown): UserAdditions {
  const result = emptyAdditions();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const raw = value as Record<string, unknown>;
  for (const layer of ADDITION_LAYERS) {
    const items = raw[layer];
    if (!Array.isArray(items)) continue;
    const parsed: unknown[] = [];
    for (const item of items) {
      const ok = ITEM_SCHEMAS[layer].safeParse(item);
      if (ok.success) parsed.push(ok.data);
    }
    (result[layer] as unknown[]) = parsed.slice(0, MAX_ITEMS_PER_LAYER);
  }
  return result;
}

/** Bỏ các tab rỗng trước khi lưu cho gọn. */
export function serializeAdditions(additions: UserAdditions): { [key: string]: Json } {
  return Object.fromEntries(
    ADDITION_LAYERS.filter((l) => additions[l].length > 0).map((l) => [l, additions[l] as Json]),
  );
}

export type AdditionError = "invalid" | "too_many" | "not_found";
export type AdditionResult =
  { ok: true; additions: UserAdditions } | { ok: false; error: AdditionError };

export function addAddition<L extends AdditionLayer>(
  additions: UserAdditions,
  layer: L,
  input: AdditionInput<L>,
  newId: string,
): AdditionResult {
  if (additions[layer].length >= MAX_ITEMS_PER_LAYER) return { ok: false, error: "too_many" };
  const parsed = ITEM_SCHEMAS[layer].safeParse({ ...input, id: newId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  return { ok: true, additions: { ...additions, [layer]: [...additions[layer], parsed.data] } };
}

export function updateAddition<L extends AdditionLayer>(
  additions: UserAdditions,
  layer: L,
  itemId: string,
  input: AdditionInput<L>,
): AdditionResult {
  const index = additions[layer].findIndex((item) => item.id === itemId);
  if (index < 0) return { ok: false, error: "not_found" };
  const parsed = ITEM_SCHEMAS[layer].safeParse({ ...input, id: itemId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const items: unknown[] = [...additions[layer]];
  items[index] = parsed.data;
  return { ok: true, additions: { ...additions, [layer]: items } };
}

export function removeAddition(
  additions: UserAdditions,
  layer: AdditionLayer,
  itemId: string,
): AdditionResult {
  const items = additions[layer].filter((item) => item.id !== itemId);
  if (items.length === additions[layer].length) return { ok: false, error: "not_found" };
  return { ok: true, additions: { ...additions, [layer]: items } };
}

/** Nghĩa hiển thị do người dùng đặt (custom_meaning). */
export const CustomMeaningSchema = z.string().trim().min(1).max(200);
