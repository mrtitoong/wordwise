import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Mã bản app: app lưu lại trang chính + code cho offline ngay khi có bản mới (tên file JS đổi).
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? `local-${Date.now()}`,
  },
  // Không để `next dev` tự chèn hướng dẫn vào CLAUDE.md (tài liệu dự án do người viết).
  agentRules: false,
  experimental: {
    // Nguồn từ của danh sách Admin (bảng 5.000 dòng, bài đọc 200.000 ký tự) gửi qua server action.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default withNextIntl(nextConfig);
