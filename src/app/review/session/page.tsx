import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { SessionScreen, type SessionOptions } from "@/features/review/session-screen";
import { parsePractice } from "@/lib/review/practice";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("review");
  return { title: t("title") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ReviewSessionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const card = z.uuid().safeParse(one(params.card));
  const more = z.coerce.number().int().min(1).max(20).safeParse(one(params.more));
  const retry = (one(params.retry) ?? "")
    .split(",")
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, 50);
  const options: SessionOptions = {
    ...(one(params.short) === "1" ? { short: true } : {}),
    ...(one(params.resume) === "1" ? { resume: true } : {}),
    ...(more.success ? { more: more.data } : {}),
    ...(card.success ? { cardId: card.data } : {}),
    ...(retry.length ? { retry } : {}),
    ...(one(params.practice) === "1"
      ? {
          practice: parsePractice({
            nb: one(params.nb),
            tag: one(params.tag),
            status: one(params.status),
            mode: one(params.mode),
            n: one(params.n),
          }),
        }
      : {}),
  };
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4">
      {/* Đổi tham số (vd "Ôn lại từ sai") thì dựng phiên mới. */}
      <SessionScreen key={JSON.stringify(options)} options={options} />
    </main>
  );
}
