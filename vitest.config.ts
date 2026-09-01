import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// Reuses the app's Vite config so aliases and the Tailwind pipeline behave
// identically in tests — a test that resolves `@/…` differently from the app is
// worse than no test.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        // Generated bindings and the plugin clients are thin wrappers over
        // `invoke`; the Rust integration tests cover what they call.
        exclude: ["src/ipc/generated/**", "src/test/**", "**/*.test.{ts,tsx}"],
      },
    },
  }),
);
