"use server";

/**
 * Thao tác của Admin với danh sách có chủ đích (Prompt 7.1). Mỗi action kiểm tra vai trò ở server
 * (requireAdmin) trước khi ghi; RLS của database chặn thêm một lớp.
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  isCoverUrl,
  LIST_CEFR,
  ListFormSchema,
  SourceSchema,
  sourceContent,
  sourceItemCount,
} from "@/lib/admin/lists";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

function parseForm(input: unknown) {
  const parsed = ListFormSchema.safeParse(input);
  if (!parsed.success) return null;
  const supabaseUrl = getSupabaseEnv()?.url ?? "";
  if (parsed.data.cover_url && !isCoverUrl(parsed.data.cover_url, supabaseUrl)) return null;
  return parsed.data;
}

export async function createList(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();
  const form = parseForm(input);
  if (!form) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("curated_lists")
    .insert({ ...form, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin");
  return { ok: true, data: { id: data.id } };
}

export async function updateList(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const form = parseForm(input);
  if (!form) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("curated_lists").update(form).eq("id", id);
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/admin");
  revalidatePath(`/admin/lists/${id}`);
  return { ok: true };
}

export async function addSource(listId: string, input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = SourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const source = parsed.data;
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("curated_lists")
    .select("status")
    .eq("id", listId)
    .maybeSingle();
  if (!list) return { ok: false, error: "not_found" };
  if (list.status === "processing") return { ok: false, error: "busy" };
  const { error } = await supabase.from("curated_list_sources").insert({
    list_id: listId,
    kind: source.kind,
    name: source.name,
    content: sourceContent(source) as never,
    item_count: sourceItemCount(source),
    created_by: user.id,
  });
  if (error) return { ok: false, error: "failed" };
  revalidatePath(`/admin/lists/${listId}`);
  return { ok: true };
}

export async function deleteSource(listId: string, sourceId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("curated_list_sources")
    .delete()
    .eq("id", sourceId)
    .eq("list_id", listId);
  if (error) return { ok: false, error: "failed" };
  revalidatePath(`/admin/lists/${listId}`);
  return { ok: true };
}

/** Bấm "Phân tích". `minCefr`: chỉ lấy từ từ cấp này trở lên (bài đọc). */
export async function startAnalysis(
  listId: string,
  minCefr: string | null,
): Promise<ActionResult<{ jobId: string }>> {
  await requireAdmin();
  if (minCefr && !(LIST_CEFR as readonly string[]).includes(minCefr)) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_list_analysis", {
    p_list_id: listId,
    p_options: minCefr ? { min_cefr: minCefr } : {},
  });
  if (error || !data) {
    const known = ["no_sources", "list_busy"].find((code) => error?.message.includes(code));
    return { ok: false, error: known ?? "failed" };
  }
  revalidatePath("/admin");
  revalidatePath(`/admin/lists/${listId}`);
  return { ok: true, data: { jobId: data } };
}

export async function retryAnalysis(listId: string, jobId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_list_analysis", { p_job_id: jobId });
  if (error) return { ok: false, error: "failed" };
  revalidatePath(`/admin/lists/${listId}`);
  return { ok: true };
}
