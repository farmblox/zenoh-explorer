/**
 * Window-level UI state: which view is showing, what the chrome looks like,
 * which overlay is open.
 *
 * Navigation lives in a store rather than a router because this is a desktop
 * window, not a document. There is no URL, no back button and no deep-linkable
 * address — but there *is* a per-session view, because each tab remembers where
 * you were. A router would model the first three and fight the fourth.
 */
import { create } from "zustand";

import type { SessionId } from "@/ipc";
import type { ViewId } from "@/navigation/types";

/** Storage key. Also read by the boot script in index.html — keep them equal. */
const THEME_KEY = "zenoh-explorer.theme";

/** What the user chose, which is not the same as what is being rendered. */
export type ThemePreference = "system" | "light" | "dark";

/** What is actually on screen. */
export type ResolvedTheme = "light" | "dark";

/** Overlays are mutually exclusive; only one can be open. */
export type Overlay = "none" | "palette" | "connect" | "settings";

/**
 * Something a view has been asked to select on arrival.
 *
 * The palette can switch views on its own, but what you picked in it lives in
 * the destination's local state — which node row is open, which key is
 * selected. This carries that across the switch. `seq` is what makes picking
 * the same node twice in a row work: without it the value is unchanged and the
 * effect that consumes it never fires again.
 */
export interface Reveal {
  readonly view: ViewId;
  readonly target: string;
  readonly seq: number;
}

interface UiState {
  /** Which view each session is showing. Switching tabs restores the view. */
  viewBySession: Record<string, ViewId>;
  /**
   * The view shown when no session is open.
   *
   * Scouting, because it is the only view that does anything useful without a
   * session: it shows what is on the network, which is exactly the question
   * you have when you are not connected to it yet.
   */
  fallbackView: ViewId;
  sidebarCollapsed: boolean;
  statusBarExpanded: boolean;
  overlay: Overlay;
  /**
   * Which pane Settings should open on, or `null` for its own default.
   *
   * A bare string rather than the dialog's own union: the store sits below
   * `features/` and cannot import from it. The dialog checks the value against
   * its pane list and ignores anything it does not recognise.
   */
  settingsPane: string | null;
  reveal: Reveal | null;
  themePreference: ThemePreference;

  setView(sessionId: SessionId | null, view: ViewId): void;
  viewFor(sessionId: SessionId | null): ViewId;
  forgetSession(sessionId: SessionId): void;

  toggleSidebar(): void;
  toggleStatusBar(): void;

  openOverlay(overlay: Exclude<Overlay, "none">): void;
  /** Opens Settings, optionally on a named pane. */
  openSettingsAt(pane: string | null): void;
  closeOverlay(): void;

  /** Switches to `view` and asks it to select `target` when it gets there. */
  revealIn(sessionId: SessionId | null, view: ViewId, target: string): void;
  /** Called by the view once it has selected the target. */
  clearReveal(): void;

  setThemePreference(preference: ThemePreference): void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  viewBySession: {},
  fallbackView: "scouting",
  sidebarCollapsed: false,
  statusBarExpanded: false,
  overlay: "none",
  settingsPane: null,
  reveal: null,
  themePreference: readStoredTheme(),

  setView: (sessionId, view) =>
    set((state) =>
      sessionId === null
        ? { fallbackView: view }
        : { viewBySession: { ...state.viewBySession, [sessionId]: view } },
    ),

  viewFor: (sessionId) => {
    const state = get();
    if (sessionId === null) return state.fallbackView;
    return state.viewBySession[sessionId] ?? "topology";
  },

  forgetSession: (sessionId) =>
    set((state) => {
      const next = { ...state.viewBySession };
      delete next[sessionId];
      return { viewBySession: next };
    }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleStatusBar: () => set((state) => ({ statusBarExpanded: !state.statusBarExpanded })),

  revealIn: (sessionId, view, target) =>
    set((state) => ({
      ...(sessionId === null
        ? { fallbackView: view }
        : { viewBySession: { ...state.viewBySession, [sessionId]: view } }),
      reveal: { view, target, seq: (state.reveal?.seq ?? 0) + 1 },
      overlay: "none",
    })),

  clearReveal: () => set({ reveal: null }),

  openOverlay: (overlay) => set({ overlay }),

  openSettingsAt: (pane) => set({ overlay: "settings", settingsPane: pane }),
  closeOverlay: () => set({ overlay: "none" }),

  setThemePreference: (preference) => {
    set({ themePreference: preference });
    persistTheme(preference);
    applyTheme(resolveTheme(preference));
  },
}));

/** Turns a preference into the theme to render. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Stamps the theme onto the document, where the token stylesheet reads it. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset["theme"] = theme;
  syncWindowChrome(theme);
}

/**
 * Tells the OS what the window is wearing.
 *
 * The frame around the page is drawn by the window server, not by us: its
 * border, its rounded corners and the colour behind the page before it paints.
 * Stamping `data-theme` repaints everything inside the webview and leaves that
 * frame at whatever it was built with, so switching to light left a near-black
 * hairline around a white app.
 *
 * The colour is read back out of `--surface-0` rather than written here, so
 * `theme.css` stays the only place a palette value exists.
 *
 * Silent outside Tauri: the same code runs in a browser during design work,
 * where there is no window to tell.
 */
function syncWindowChrome(theme: ResolvedTheme): void {
  if (!("__TAURI_INTERNALS__" in globalThis)) return;

  void (async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setTheme(theme);

      const surface = getComputedStyle(document.documentElement)
        .getPropertyValue("--surface-0")
        .trim();
      const rgb = parseHex(surface);
      if (rgb) await win.setBackgroundColor(rgb);
    } catch {
      // A window that will not take a theme is a cosmetic loss, not a fault
      // worth interrupting anyone over.
    }
  })();
}

/** `#0a0c0f` → `[10, 12, 15]`. Null for anything that is not a six-digit hex. */
function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match?.[1]) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Blocked storage is not an error worth surfacing; fall back to system.
    return "system";
  }
}

function persistTheme(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // The choice still applies for this run; it just will not survive a restart.
  }
}
