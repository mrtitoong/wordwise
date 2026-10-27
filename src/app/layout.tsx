import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { DeferredProviders } from "@/components/deferred-providers";
import { InstanceGate } from "@/components/instance-gate";
import { ToastViewport } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme } from "@/lib/theme";
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
    // iPhone/iPad: mở từ màn hình chính như app (không thanh địa chỉ).
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Thanh trạng thái theo nền trang (sáng/tối theo máy; chọn Sáng/Tối trong app thì script đổi lớp).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#11181d" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Chọn Tối thì máy chủ đặt sẵn lớp; Theo máy thì script trong <head> áp trước khi vẽ.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      className={cn(font.variable, theme === "dark" && "dark")}
      // Script đổi lớp `dark` trước khi React chạy.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <NextIntlClientProvider>
          <InstanceGate>
            <DeferredProviders />
            {children}
          </InstanceGate>
          <ToastViewport />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
