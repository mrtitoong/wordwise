import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

/** Web App Manifest: cài lên màn hình chính, mở bằng icon thì vào thẳng Hôm nay. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("app");
  const nav = await getTranslations("nav");
  return {
    id: "/",
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1f7396",
    lang: await getLocale(),
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("shortcutReview"), url: "/review/session" },
      { name: nav("addWord"), url: "/add" },
    ],
  };
}
