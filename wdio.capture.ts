import { config as base } from "./wdio.conf";

/**
 * Screenshot configuration.
 *
 * Shares everything with the E2E config except which files it runs, so the
 * capture spec cannot drift from how the real suite launches the app — and so
 * `pnpm e2e` never runs a spec that asserts nothing.
 */
export const config = {
  ...base,
  specs: ["./e2e/capture/**/*.spec.ts"],
};
