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
    // Python virtualenvs under projects/ ship vendored JavaScript (sklearn's
    // HTML repr, for one), which is not ours to lint.
    "projects/**/.venv/**",
    "infra/**/.venv/**",
    // Generated runners for the two-minute-drill parity test.
    "projects/**/results/**",
  ]),
]);

export default eslintConfig;
