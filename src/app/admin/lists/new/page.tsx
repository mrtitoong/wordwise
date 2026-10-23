import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListForm } from "@/features/admin/list-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.form");
  return { title: t("newTitle") };
}

/** Tạo danh sách mới (ux-flows §3.13): khai báo trước, thêm nguồn từ ở trang chi tiết. */
export default async function NewListPage() {
  const t = await getTranslations("admin.form");
  return (
    <main className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <ListForm />
    </main>
  );
}
