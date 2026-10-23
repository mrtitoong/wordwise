import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Không để `next dev` tự chèn hướng dẫn vào CLAUDE.md (tài liệu dự án do người viết).
  agentRules: false,
  experimental: {
    // Nguồn từ của danh sách Admin (bảng 5.000 dòng, bài đọc 200.000 ký tự) gửi qua server action.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default withNextIntl(nextConfig);
