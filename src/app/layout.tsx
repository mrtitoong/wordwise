import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SyncProvider } from "@/components/sync/sync-provider";
import { ToastViewport } from "@/components/ui/toast";
import { ImportProvider } from "@/features/import/import-provider";
import "./globals.css";

const font = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("description"),
    applicationName: t("name"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f7396",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={font.variable}>
      <body className="min-h-dvh font-sans">
        <NextIntlClientProvider>
          <SyncProvider />
          <ImportProvider />
          {children}
          <ToastViewport />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
