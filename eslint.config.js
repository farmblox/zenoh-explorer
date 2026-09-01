import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "target", "src/ipc/generated", "src-tauri/gen", "design/mockup", "coverage"],
  },

  js.configs.recommended,

  {
    // Type-aware rules are scoped to TypeScript. Letting them apply to this
    // config file would fail: they need a program, and a .js file has none.
    files: ["**/*.{ts,tsx}"],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Unused values are an error, but a leading underscore is how this
      // codebase says "required by the signature, deliberately ignored".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // `void promise` is how we say "fire and forget, on purpose".
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],

      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Off because of Zustand. `useStore((s) => s.someAction)` looks like
      // pulling a method off an object, but store actions are closures over
      // `set`/`get` and never touch `this`, so there is nothing to unbind.
      "@typescript-eslint/unbound-method": "off",
    },
  },

  {
    // The layering rule, enforced rather than documented: only src/ipc and the
    // plugin clients may reach for Tauri. Everything else goes through them.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/ipc/**", "src/hooks/useCopy.ts", "src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/*"],
              message:
                "Import Tauri only from src/ipc or a plugin's guest-js client, so the IPC surface stays in one place.",
            },
            {
              group: ["@/features/*/*"],
              message:
                "Import a feature through its index.ts. Reaching inside couples views to each other's internals.",
            },
          ],
        },
      ],
    },
  },

  {
    // Plugin clients are the layer that is allowed to touch Tauri.
    files: ["crates/*/guest-js/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // Tests stub the IPC layer, so they import from @tauri-apps to mock it.
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  {
    // Node config files: globals differ, and no browser APIs exist.
    files: ["*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },

  {
    // The E2E suite and its config run under their own tsconfig with the wdio
    // globals. Those are loosely typed by design, so type-aware rules here
    // report noise rather than bugs.
    files: ["e2e/**/*.ts", "wdio.conf.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node, ...globals.mocha } },
  },
);
