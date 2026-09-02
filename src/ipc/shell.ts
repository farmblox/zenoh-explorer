/**
 * The native shell: its menu, and links out of the app.
 *
 * Lives in the IPC layer because it imports from `@tauri-apps/*`, which nothing
 * outside this directory may do.
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Event the Rust side emits when a menu item with an id is chosen. */
const MENU_EVENT = "zenoh://menu";

/**
 * Subscribes to the native menu.
 *
 * Items the OS handles itself — copy, paste, minimise, the Services submenu —
 * never arrive here. Only the ones `menu.rs` gave an id to, because the shell
 * cannot know what "Re-read the network" means for the tab that happens to be
 * open.
 */
export function onMenuEvent(handler: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>(MENU_EVENT, ({ payload }) => handler(payload));
}

/** Opens a URL in the user's browser, never in the app's own webview. */
export function openExternal(url: string): Promise<void> {
  return openUrl(url);
}
