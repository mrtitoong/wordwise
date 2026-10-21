/**
 * Đóng gói Edge Functions: src/functions/<tên>/main.ts → supabase/functions/<tên>/index.js.
 *
 * Supabase Edge Runtime chạy Deno, không hiểu alias "@/…" và import không đuôi của dự án,
 * nên code trong src/ được gộp sẵn thành một file JS. Thư viện npm không gộp mà đổi thành
 * `npm:tên@phiên-bản` (đúng bản trong package.json) để Deno tự tải.
 *
 *   npm run functions:build          – ghi file
 *   npm run functions:build -- --check – báo lỗi nếu file đã commit cũ hơn mã nguồn (CI)
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { build, type Plugin } from "esbuild";

const FUNCTIONS = ["generate-word", "word-media"];

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
};

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** "zod" → "npm:zod@4.6.5"; thư viện không có trong dependencies thì báo lỗi. */
const npmSpecifiers: Plugin = {
  name: "npm-specifiers",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      // "@/…" là alias của src/ (esbuild đọc tsconfig.json).
      if (args.path.startsWith("@/")) return undefined;
      if (args.path.startsWith("npm:") || args.path.startsWith("node:")) {
        return { path: args.path, external: true };
      }
      const name = packageName(args.path);
      const version = pkg.dependencies[name];
      if (!version) {
        return { errors: [{ text: `${name} không có trong dependencies của package.json` }] };
      }
      if (!/^\d+\.\d+\.\d+/.test(version)) {
        return { errors: [{ text: `${name}: cần phiên bản cố định, đang là "${version}"` }] };
      }
      return { path: `npm:${name}@${version}${args.path.slice(name.length)}`, external: true };
    });
  },
};

/** `import x from "./file.md?raw"` → nội dung file dạng chuỗi (giống Vite). */
const rawImports: Plugin = {
  name: "raw-imports",
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, async (args) => {
      const result = await b.resolve(args.path.slice(0, -"?raw".length), {
        kind: args.kind,
        resolveDir: args.resolveDir,
        importer: args.importer,
      });
      if (result.errors.length) return { errors: result.errors };
      // Đường dẫn tương đối, dạng "/": bundle giống nhau trên Windows và Linux (CI so khớp).
      return { path: relative(process.cwd(), result.path).replaceAll("\\", "/"), namespace: "raw" };
    });
    b.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({
      contents: readFileSync(args.path, "utf8").replaceAll("\r\n", "\n"),
      loader: "text",
    }));
  },
};

const check = process.argv.includes("--check");
let stale = false;

for (const name of FUNCTIONS) {
  const outfile = `supabase/functions/${name}/index.js`;
  const result = await build({
    entryPoints: [`src/functions/${name}/main.ts`],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    charset: "utf8",
    legalComments: "none",
    plugins: [rawImports, npmSpecifiers],
    banner: {
      js:
        `// File sinh tự động từ src/functions/${name}/main.ts bởi scripts/build-functions.ts.\n` +
        "// Không sửa tay: sửa mã nguồn rồi chạy `npm run functions:build`.",
    },
    logLevel: "warning",
  });
  const output = result.outputFiles[0]!.text;

  if (check) {
    let current = "";
    try {
      current = readFileSync(outfile, "utf8");
    } catch {
      // chưa có file
    }
    if (current !== output) {
      console.error(`${outfile} cũ hơn mã nguồn: chạy npm run functions:build rồi commit.`);
      stale = true;
    }
  } else {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(`supabase/functions/${name}`, { recursive: true });
    writeFileSync(outfile, output);
    console.log(`${outfile}: ${(output.length / 1024).toFixed(0)} KB`);
  }
}

if (stale) process.exit(1);
