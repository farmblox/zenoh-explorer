/**
 * Platform facts the UI has to lay out around.
 *
 * Read synchronously from the user agent rather than through
 * `tauri-plugin-os`, which is async — the title bar needs this on its very
 * first render, and a one-frame flash of the wrong inset is exactly the kind
 * of thing that makes a window feel cheap.
 */
const APPLE = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

/** `true` on macOS, where the window buttons are drawn by the system. */
export const isMac = APPLE;

/**
 * Horizontal space the macOS traffic lights occupy, measured from the window's
 * left edge.
 *
 * Three 12px buttons on 20px centres starting at x=19 (the system-standard
 * inset, set in `tauri.conf.json`) span roughly 19..71; 84 clears them with
 * room to breathe. Keep the two in step — this constant and
 * `trafficLightPosition` describe the same thing from opposite sides.
 *
 * On the vertical: `trafficLightPosition.y` is NOT the top inset. Tao sizes the
 * buttons' container to `buttonHeight + y` and top-anchors it without touching
 * each button's own offset inside that container, so the visible top lands
 * lower than `y` suggests. 24 is both what that works out to for a 48px bar and
 * the value the Tauri community settled on.
 *
 * Nothing interactive may be placed inside this. The system draws the buttons
 * on top of our chrome, so anything here is both invisible and unclickable.
 */
export const TRAFFIC_LIGHT_INSET = APPLE ? 84 : 0;
