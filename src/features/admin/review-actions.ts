"use server";

/**
 * Thao tác duyệt và xuất bản danh sách (Prompt 7.3). Mỗi action kiểm tra vai trò ở server
 * (requireAdmin); hàm SQL kiểm tra lại admin và trạng thái danh sách.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminSavePayload } from "@/lib/admin/review";
import { requireAdmin } from "@/lib/auth/admin";
import { WordContentSchema } from "@/lib/schema/word";
import { createClient } from "@/lib/supabase/server";
import type { StoredWord } from "@/lib/words/api";
import { toStoredWord, WORD_SELECT, type WordWithSenses } from "@/lib/words/supabase-store";
import type { ActionResult } from "./actions";

const Id = z.uuid();

/** Mã lỗi từ hàm SQL mà giao diện hiển thị riêng; còn lại là "failed". */
const KNOWN_ERRORS = [
  "list_locked",
  "items_not_accepted",
  "list_empty",
  "list_not_in_review",
  "list_not_published",
  "sense_already_in_list",
  "sense_of_other_word",
  "items_mismatch",
  "senses_mismatch",
] as const;

function failure(error: { message: string } | null): { ok: false; error: string } {
  const known = KNOWN_ERRORS.find((code) => error?.message.includes(code));
  if (!known && error) console.error("Duyệt danh sách lỗi:", error.message);
  return { ok: false, error: known ?? "failed" };
}

function refresh(listId: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/lists/${listId}`);
  revalidatePath(`/admin/lists/${listId}/review`);
}

export async function reorderItems(listId: string, itemIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  if (!Id.safeParse(listId).success || !z.array(Id).max(10_000).safeParse(itemIds).success) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_list_items", {
    p_list_id: listId,
    p_item_ids: itemIds,
  });
  if (error) return failure(error);
  revalidatePath(`/admin/lists/${listId}/review`);
  return { ok: true };
}

export async function removeItem(listId: string, itemId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_list_item", {
    p_list_id: listId,
    p_item_id: itemId,
  });
  if (error) return failure(error);
  refresh(listId);
  return { ok: true };
}

export async function setItemSense(
  listId: string,
  itemId: string,
  senseId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_item_sense", {
    p_list_id: listId,
    p_item_id: itemId,
    p_sense_id: senseId,
  });
  if (error) return failure(error);
  revalidatePath(`/admin/lists/${listId}/review`);
  return { ok: true };
}

/** itemIds = null: chấp nhận mọi mục không có cảnh báo. Trả số mục đã đổi. */
export async function acceptItems(
  listId: string,
  itemIds: string[] | null,
  accepted: boolean,
): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  if (itemIds && !z.array(Id).max(10_000).safeParse(itemIds).success) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_accept_list_items", {
    p_list_id: listId,
    // Hàm SQL nhận null (= mục không cảnh báo); kiểu sinh ra không ghi được null.
    p_item_ids: itemIds as string[],
    p_accepted: accepted,
  });
  if (error) return failure(error);
  revalidatePath(`/admin/lists/${listId}/review`);
  return { ok: true, data: { count: data ?? 0 } };
}

export async function publishList(listId: string): Promise<ActionResult<{ version: number }>> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_publish_list", { p_list_id: listId });
  if (error || !data) return failure(error);
  refresh(listId);
  return { ok: true, data: { version: data } };
}

export async function openDraft(listId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_open_list_draft", { p_list_id: listId });
  if (error) return failure(error);
  refresh(listId);
  return { ok: true };
}

export async function discardDraft(listId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_discard_list_draft", { p_list_id: listId });
  if (error) return failure(error);
  refresh(listId);
  return { ok: true };
}

async function loadStoredWord(wordId: string): Promise<StoredWord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("words")
    .select(WORD_SELECT)
    .eq("id", wordId)
    .maybeSingle();
  if (error || !data) return null;
  return toStoredWord(data as unknown as WordWithSenses);
}

/** Nội dung một từ cho khung xem/sửa ở màn duyệt. */
export async function getWord(wordId: string): Promise<ActionResult<{ word: StoredWord }>> {
  await requireAdmin();
  if (!Id.safeParse(wordId).success) return { ok: false, error: "invalid" };
  const word = await loadStoredWord(wordId);
  return word ? { ok: true, data: { word } } : { ok: false, error: "not_found" };
}

/**
 * Lưu nội dung từ Admin đã sửa vào kho dùng chung (mọi người học thấy). Không đổi chữ, loại từ,
 * ngôn ngữ và số nghĩa.
 */
export async function saveWordContent(
  listId: string,
  wordId: string,
  input: unknown,
): Promise<ActionResult<{ word: StoredWord }>> {
  await requireAdmin();
  if (!Id.safeParse(wordId).success) return { ok: false, error: "invalid" };
  const parsed = WordContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const current = await loadStoredWord(wordId);
  if (!current) return { ok: false, error: "not_found" };
  const content = parsed.data;
  if (
    content.lemma !== current.content.lemma ||
    content.pos !== current.content.pos ||
    content.language !== current.content.language ||
    content.senses.length !== current.senseIds.length
  ) {
    return { ok: false, error: "invalid" };
  }
  const payload = adminSavePayload(content, current.senseIds);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_word", {
    p_word_id: wordId,
    p_word: payload.word,
    p_senses: payload.senses,
    p_details: payload.details,
  });
  if (error) return failure(error);
  const saved = await loadStoredWord(wordId);
  revalidatePath(`/admin/lists/${listId}/review`);
  return saved ? { ok: true, data: { word: saved } } : { ok: false, error: "failed" };
}
