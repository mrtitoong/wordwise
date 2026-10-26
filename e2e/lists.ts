/** Danh sách có chủ đích cho E2E: tạo và xuất bản thẳng bằng quyền service (chỉ CI). */
import { serverAdmin } from "./helpers";

export async function firstSenses(lemmas: readonly string[]) {
  const { data, error } = await serverAdmin()!
    .from("word_senses")
    .select("id, words!inner (lemma)")
    .in("words.lemma", [...lemmas])
    .eq("sense_order", 0);
  if (error) throw new Error(error.message);
  const rows = data as unknown as { id: string; words: { lemma: string } }[];
  return lemmas.map((lemma) => rows.find((r) => r.words.lemma === lemma)!.id);
}

/** Xuất bản thẳng một bản phát hành (như admin_publish_list) bằng quyền service. */
export async function publish(
  listId: string,
  version: number,
  senseIds: string[],
  added: string[],
) {
  const admin = serverAdmin()!;
  const release = await admin.from("curated_list_releases").insert({
    list_id: listId,
    version,
    word_count: senseIds.length,
    added_sense_ids: added,
  });
  if (release.error) throw new Error(release.error.message);
  const items = await admin.from("curated_list_release_items").insert(
    senseIds.map((sense_id, i) => ({
      list_id: listId,
      version,
      sense_id,
      item_order: i,
      subtopic: i < 2 ? "Môi trường" : "Công việc",
    })),
  );
  if (items.error) throw new Error(items.error.message);
  const list = await admin
    .from("curated_lists")
    .update({ status: "published", version, published_at: new Date().toISOString() })
    .eq("id", listId);
  if (list.error) throw new Error(list.error.message);
}

export async function seedList(
  title: string,
  lemmas: readonly string[],
  { suggestedDays = 45 }: { suggestedDays?: number | null } = {},
) {
  const { data, error } = await serverAdmin()!
    .from("curated_lists")
    .insert({
      title,
      language: "en",
      status: "draft",
      target_cefr: "B2",
      purpose: "ielts",
      suggested_days: suggestedDays,
      description: "Danh sách thử cho E2E.",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message);
  const senses = await firstSenses(lemmas);
  await publish(data.id, 1, senses, senses);
  return { listId: data.id as string, senses };
}
