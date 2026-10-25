import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TopBar } from "@/components/app-shell/top-bar";
import { loadLibrary } from "@/features/library/library-server";
import { LibraryScreen } from "@/features/library/library-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("library");
  return { title: t("title") };
}

/** Thư viện: luôn đọc bản mới nhất (danh sách vừa xuất bản hiện ngay). */
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const t = await getTranslations("library");
  const lists = await loadLibrary();
  return (
    <>
      <TopBar title={t("title")} backHref="/notebooks" />
      <LibraryScreen lists={lists} />
    </>
  );
}
