/**
 * Entry point. Boots the backend bridge, then renders.
 *
 * `bootstrap` is awaited before the first render so the app never paints an
 * empty session list it is about to replace a frame later.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/App";
import { bootstrap } from "@/app/bootstrap";
import "@/styles/index.css";

// The frontend half of the WDIO bridge is test-only. Its Rust half is guarded
// by the `e2e` Cargo feature; the Vite mode mirrors that guard so no automation
// API or mocking hook ships in a production bundle.
if (import.meta.env.MODE === "e2e") {
  const { invoke } = await import("@tauri-apps/api/core");
  const testWindow = window as unknown as {
    __TAURI__?: { core?: { invoke: typeof invoke }; [key: string]: unknown };
    __wdio_original_core__?: { invoke: typeof invoke };
  };
  const core = testWindow.__TAURI__?.core ?? { invoke };
  if (testWindow.__TAURI__) {
    if (!testWindow.__TAURI__.core) {
      Object.defineProperty(testWindow.__TAURI__, "core", { value: core, configurable: true });
    }
  } else testWindow.__TAURI__ = { core };
  testWindow.__wdio_original_core__ = core;
  await import("@wdio/tauri-plugin");
}

const container = document.getElementById("root");
if (!container) throw new Error("index.html is missing #root");

await bootstrap();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
