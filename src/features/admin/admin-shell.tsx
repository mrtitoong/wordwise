import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const linkClass =
  "flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Khung khu Admin (ux-flows §3.13): máy tính có thanh bên trái, điện thoại thành hàng liên kết cuộn
 * ngang phía trên (dùng được nhưng không tối ưu – chốt GĐ7). Không dùng thanh điều hướng dưới.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("admin.nav");
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13rem_1fr]">
      <nav
        aria-label={t("label")}
        className="flex gap-1 overflow-x-auto border-b p-2 md:flex-col md:border-r md:border-b-0 md:p-3"
      >
        <Link href="/admin" className={`${linkClass} font-semibold`}>
          {t("lists")}
        </Link>
        <Link href="/admin/lists/new" className={linkClass}>
          {t("newList")}
        </Link>
        <span className={`${linkClass} text-muted-foreground hover:bg-transparent`}>
          {t("reports")} · {t("soon")}
        </span>
        <Link href="/" className={`${linkClass} text-muted-foreground md:mt-auto`}>
          {t("backToApp")}
        </Link>
      </nav>
      <div className="min-w-0 px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}
