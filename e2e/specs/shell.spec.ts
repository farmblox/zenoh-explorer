import { browser, expect, $ } from "@wdio/globals";

/**
 * Smoke tests for the application shell.
 *
 * These cover what the other two layers cannot: that the window actually opens,
 * that the frontend boots against the real Rust backend, and that the chrome
 * renders. Everything below the surface is already covered by the Rust
 * integration tests and the Vitest suite, so this layer stays deliberately thin
 * — E2E tests are the slowest and most brittle, and are worth spending only on
 * the seam no other test can reach.
 */
describe("application shell", () => {
  it("opens a window with the app mounted", async () => {
    await expect($("#root")).toBeExisting();
  });

  it("renders the navigation rail", async () => {
    const nav = $('nav[aria-label="Views"]');
    await expect(nav).toBeDisplayed();
    await expect(nav).toHaveTextContaining("Topology");
  });

  it("reports no open session on a cold start", async () => {
    await expect($("footer")).toHaveTextContaining("No session");
  });

  it("reaches the Rust backend over IPC", async () => {
    // Exercises the real command path: `zenoh-session|list_sessions` runs in
    // Rust and returns an empty registry.
    const sessions = await browser.tauri.execute(async () => {
      const { invoke } = window.__TAURI__.core;
      return invoke("plugin:zenoh-session|list_sessions");
    });
    expect(sessions).toEqual([]);
  });

  it("answers a pure command with Zenoh's own key-expression semantics", async () => {
    const analysis = await browser.tauri.execute(async () => {
      const { invoke } = window.__TAURI__.core;
      return invoke("plugin:zenoh-keyspace|analyse_key_expr", { expr: "fleet/**/*" });
    });

    // `**/*` canonicalises to `*/**`. Getting this from the real zenoh-keyexpr
    // crate rather than a JS reimplementation is the whole point of the view.
    expect(analysis).toMatchObject({ valid: true, isCanonical: false, canonical: "fleet/*/**" });
  });

  it("opens the connect dialog from the tab strip", async () => {
    await $('button[aria-label="Connect to a network"]').click();
    await expect($('dialog[aria-label="Connect to a network"]')).toBeDisplayed();
  });
});
