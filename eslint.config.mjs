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
    // Compiler output (generated, not hand-written)
    "midnight/managed/**",
    "public/midnight/**",
  ]),
  {
    // "Load data when the page opens" effects are normal; show them as warnings, not errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // The Midnight SDK is loosely typed, so `any` is accepted in the Midnight glue code.
    files: ["lib/midnight/**", "app/admin/midnight/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
