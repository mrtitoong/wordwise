import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("unsupported");
  return { title: t("title") };
}

/**
 * Trang báo trình duyệt quá cũ (script trong <head> chuyển tới, xem src/lib/browser-support.ts). Chỉ
 * dùng style viết thẳng trên thẻ: trình duyệt cũ bỏ qua CSS Tailwind (`@layer`) và có thể không chạy JS
 * của app. Ai cũng vào được (proxy.ts không chặn).
 */
export default async function UnsupportedPage() {
  const t = await getTranslations("unsupported");
  const text = { margin: "0 0 12px", fontSize: 16, lineHeight: 1.5, color: "#4b5563" };
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        zIndex: 2147483647,
        background: "#ffffff",
        color: "#111827",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
        textAlign: "center",
        padding: "48px 16px",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh, không cần JS */}
        <img
          src="/brand/logo.svg"
          alt=""
          width={72}
          height={72}
          style={{ display: "block", margin: "0 auto 16px" }}
        />
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 600 }}>{t("title")}</h1>
        <p style={text}>{t("body")}</p>
        <p style={text}>{t("iphone")}</p>
        <p style={{ ...text, marginBottom: 0 }}>{t("other")}</p>
      </div>
    </main>
  );
}
