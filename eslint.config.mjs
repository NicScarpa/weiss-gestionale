import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".venv/**",
    "scripts/**",
    // Service worker compilato da `npm run build:sw`: codice generato.
    "public/sw.js",
    // Rapporto HTML di `npm run test:coverage`: è generato, non è nel
    // repository, e chi lo produce in locale si trova centinaia di avvisi su
    // file che non ha scritto.
    "coverage/**",
  ]),
]);

export default eslintConfig;
