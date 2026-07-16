import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // v0.3.53-B P2対応 (Codex 指摘): npm run test:category のコンパイル生成物を除外。
    // 生成 JS (CJS の require) が全体 lint に no-require-imports 3件を混入させていた
    ".test-dist/**",
  ]),
]);

export default eslintConfig;
