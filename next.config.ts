import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Không để `next dev` tự chèn hướng dẫn vào CLAUDE.md (tài liệu dự án do người viết).
  agentRules: false,
};

export default withNextIntl(nextConfig);
