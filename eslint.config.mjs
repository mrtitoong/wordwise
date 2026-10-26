import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "design/**",
    // Sinh tự động bởi scripts/build-functions.ts
    "supabase/functions/*/index.js",
    // Sinh tự động bởi scripts/build-sw.ts
    "public/sw.js",
    "next-env.d.ts",
  ]),
]);
