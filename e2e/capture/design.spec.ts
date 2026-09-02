import { browser, $ } from "@wdio/globals";
import { mkdirSync } from "node:fs";

/**
 * Captures the real application for design review.
 *
 * Not a test — it asserts nothing and is excluded from `pnpm e2e`. It exists
 * because judging spacing, weight and contrast from source is guesswork, and
 * the webview renders differently from a browser: WKWebView's font smoothing,
 * the real traffic lights, and the window's own background all only appear
 * here.
 *
 * Run with `pnpm capture`; the images land in `design/captures/`, which is
 * gitignored.
 */
const OUT = "design/captures";

/** Views worth a frame, by the label their sidebar item carries. */
const VIEWS = ["Topology", "Peers & sessions", "Regions", "Keyspace", "Admin space", "Scouting"];

async function shoot(name: string): Promise<void> {
  // Let any entrance animation settle, or every frame catches a fade midway.
  await browser.pause(500);
  await browser.saveScreenshot(`${OUT}/${name}.png`);
}

describe("design capture", () => {
  before(() => mkdirSync(OUT, { recursive: true }));

  it("captures the connect dialog, which is the resting state", async () => {
    await $("dialog[open]")
      .waitForDisplayed({ timeout: 15_000 })
      .catch(() => {});
    await shoot("00-connect");
  });

  it("captures each view", async () => {
    // The dialog opens over everything on a cold start; dismiss it first.
    await browser.keys("Escape");
    await browser.pause(400);

    for (const [index, label] of VIEWS.entries()) {
      const item = $(`button=${label}`);
      if (!(await item.isExisting())) continue;
      await item.click();
      await shoot(
        `${String(index + 1).padStart(2, "0")}-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      );
    }
  });

  it("captures the sidebar collapsed", async () => {
    await browser.keys(["Meta", "b"]);
    await shoot("90-sidebar-collapsed");
    await browser.keys(["Meta", "b"]);
  });
});
