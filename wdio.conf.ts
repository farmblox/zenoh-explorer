import type { Options } from "@wdio/types";

/**
 * End-to-end configuration.
 *
 * Drives the real, built application through WebDriver. The `embedded` driver
 * provider is what makes this work on macOS — `tauri-driver` has no WKWebView
 * backend there, so the WebDriver server runs inside the app instead. That
 * server is compiled in only under the `e2e` cargo feature; a release build has
 * no such hooks.
 *
 * Run with:  pnpm e2e   (which builds `--features e2e` first)
 */
/**
 * The binary `pnpm build:e2e` actually produces.
 *
 * Two things decide this path and neither is obvious. `--no-bundle` means there
 * is no `.app` on macOS, just the executable; and because the crates live in a
 * Cargo workspace, the target directory is at the repository root rather than
 * under `src-tauri/`.
 */
const BINARY =
  process.platform === "win32"
    ? "./target/release/zenoh-explorer.exe"
    : "./target/release/zenoh-explorer";

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./e2e/specs/**/*.spec.ts"],
  maxInstances: 1,

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: BINARY },
    },
  ],

  services: [["@wdio/tauri-service", { driverProvider: "embedded" }]],

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    // A Zenoh connect can wait on a TCP timeout; the default 10s is too tight.
    timeout: 60_000,
  },

  logLevel: "warn",
  waitforTimeout: 15_000,
};
