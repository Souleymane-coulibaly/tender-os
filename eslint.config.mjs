import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Correctif audit Codex Sprint 23A (P1-01) — `.mjs` (config PostCSS/ESLint, scripts Node comme
    // `generate-favicons.mjs`) ne passent JAMAIS par le parseur typescript-eslint (qui résout les
    // globals via `lib`/`types` de tsconfig) : sans ceci, `console`/`process` sont de vrais
    // `no-undef` (partie d'`eslint:recommended`). Scopé aux `.mjs` uniquement — jamais élargi aux
    // fichiers `.ts`/`.tsx` du navigateur/React, qui n'en ont pas besoin.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    settings: {
      next: {
        rootDir: "apps/web",
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
);
