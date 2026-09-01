import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/cn";
import { TRAFFIC_LIGHT_INSET } from "@/lib/platform";
import { focusRingOnChrome, transitionFast } from "@/lib/states";
import { useUiStore } from "@/stores";
import { SessionTabs } from "./SessionTabs";

/** Sidebar widths, mirrored from Sidebar.tsx so the title bar can line up. */
const NAV_WIDTH_OPEN = 232;
const NAV_WIDTH_COLLAPSED = 72;

/** The toggle button plus the gap it needs from the traffic lights. */
const TOGGLE_SLOT = 38;

/**
 * Height of the strip, in pixels.
 *
 * Deep enough that a 40px tab sits IN it with a margin, rather than filling it
 * edge to edge. A tab strip that is barely taller than its tabs reads as window
 * chrome the tabs were squeezed into.
 */
const HEIGHT = 56;

/**
 * The window's top strip.
 *
 * Tauri hides the native title bar (`titleBarStyle: "Overlay"`) so this row can
 * hold the session tabs, but macOS still draws the traffic lights on top of it.
 * That makes the left inset a hard constraint rather than a style choice:
 * anything rendered under those buttons is invisible AND unclickable.
 *
 * The left block therefore never shrinks below `TRAFFIC_LIGHT_INSET` plus room
 * for the toggle, so a collapsed sidebar cannot slide the toggle under the
 * window buttons where it would be invisible and unclickable.
 *
 * `data-tauri-drag-region="deep"` is what makes the window draggable. Two things
 * about it are easy to get wrong. It has to be the attribute, not Electron's
 * `-webkit-app-region: drag` CSS, which WebKit ignores. And it has to be
 * `"deep"` rather than bare: a bare attribute only starts a drag on a direct
 * click on that exact element, so any child covering the bar makes it dead.
 * `"deep"` drags from anywhere in the subtree, and Tauri still exempts buttons,
 * links and inputs automatically.
 */
export function Titlebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const navWidth = collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_OPEN;
  const leftWidth = Math.max(navWidth, TRAFFIC_LIGHT_INSET + TOGGLE_SLOT);

  return (
    <header
      data-tauri-drag-region="deep"
      style={{ height: HEIGHT }}
      className="bg-surface-0 flex shrink-0 items-stretch"
    >
      <div
        style={{ width: leftWidth, paddingLeft: TRAFFIC_LIGHT_INSET }}
        className={cn(
          "flex shrink-0 items-center justify-end pr-3",
          "transition-[width] duration-(--duration-base) ease-(--ease-out)",
        )}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "rounded-inner text-ink-faint hover:bg-surface-2 hover:text-ink",
            "flex size-7 items-center justify-center",
            transitionFast,
            focusRingOnChrome,
          )}
        >
          <PanelLeft size={15} />
        </button>
      </div>

      <SessionTabs />
    </header>
  );
}
