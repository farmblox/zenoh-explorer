import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Tauri drives this config: it starts the dev server itself and reads
// `frontendDist` from tauri.conf.json for production builds.
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": resolve("./src"),
      // Each first-party plugin ships its TypeScript client next to its Rust
      // source, so the whole plugin — commands, permissions and the API the
      // frontend calls them through — lives in one directory.
      "@plugin/zenoh-session": resolve("./crates/tauri-plugin-zenoh-session/guest-js"),
      "@plugin/zenoh-topology": resolve("./crates/tauri-plugin-zenoh-topology/guest-js"),
      "@plugin/zenoh-keyspace": resolve("./crates/tauri-plugin-zenoh-keyspace/guest-js"),
      "@plugin/zenoh-data": resolve("./crates/tauri-plugin-zenoh-data/guest-js"),
      "@plugin/zenoh-profiles": resolve("./crates/tauri-plugin-zenoh-profiles/guest-js"),
    },
  },

  // Tauri expects a fixed port and must fail rather than silently pick another.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: {
      // Rust rebuilds are Tauri's job; watching these would restart the dev
      // server on every `cargo check`.
      ignored: ["**/target/**", "**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_ENV_"],

  build: {
    // Match the webviews Tauri actually ships against.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome110" : "safari15",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 1500,
  },
});
