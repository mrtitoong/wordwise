import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function AddWordFab() {
  const t = await getTranslations("nav");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-20">
      <div className="mx-auto flex max-w-md justify-end px-4">
        <Link
          href="/add"
          aria-label={t("addWord")}
          className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
        >
          <Plus className="size-7" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
