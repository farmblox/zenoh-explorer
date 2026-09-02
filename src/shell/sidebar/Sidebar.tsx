import { useMemo } from "react";
import { Search, Settings } from "lucide-react";

import { Kbd } from "@/components/ui";
import { buildRegionView } from "@/features/topology";
import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";
import { VIEWS } from "@/navigation/views";
import type { ViewDefinition } from "@/navigation/types";
import { useNavigation } from "@/navigation/useNavigation";
import { useActiveSession, useDiagnosticsStore, useTopology, useUiStore } from "@/stores";
import { SidebarItem, type SidebarBadge } from "./SidebarItem";

/**
 * The navigation rail.
 *
 * Every view, always. There were section headings above the groups and a "More"
 * toggle hiding two of them, which spent four rows of chrome organising nine
 * destinations — and put Configuration somewhere you had to go looking. The
 * seams between groups are still here as hairlines: a rule you can see does the
 * grouping, and a heading you have to read to use was not pulling its weight.
 *
 * The numerals are tabular and right-aligned so they form a column, and a view
 * only carries one when it has something real to report — which keeps the column
 * sparse enough that a number means something.
 */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const openOverlay = useUiStore((state) => state.openOverlay);

  const { view: activeView, navigate } = useNavigation();
  const session = useActiveSession();
  const unread = useDiagnosticsStore((state) => state.unread);
  const snapshot = useTopology(session?.id ?? null).snapshot;

  const regionCount = useMemo(
    () => (snapshot ? buildRegionView(snapshot).regions.length : null),
    [snapshot],
  );

  /**
   * What each view has to report, if anything.
   *
   * One meaning for the column: **how much is in there**. A view earns a number
   * when the explorer already knows the answer from what the backend pushes, and
   * gets none when the view has to go and ask — Scouting, Admin space and
   * Configuration all run a query when you open them, and a badge that appears
   * only after your first visit is less consistent than no badge at all.
   *
   * Topology is the other exception, for the opposite reason: it draws the same
   * collection Nodes counts, and two rows reading 11 would be one fact wearing
   * two badges.
   */
  const badgeFor = (view: ViewDefinition): SidebarBadge | undefined => {
    if (!session) return undefined;

    switch (view.id) {
      case "keyspace":
        // A running tap outranks the key count: it is the thing that is
        // happening, rather than the thing that is true.
        return session.tapCount > 0 ? { kind: "live" } : { kind: "count", value: session.keyCount };
      case "nodes":
        // From the snapshot rather than the session summary, so the number the
        // badge shows is the number the page shows.
        return snapshot ? { kind: "count", value: snapshot.nodes.length } : undefined;
      case "regions":
        return regionCount === null ? undefined : { kind: "count", value: regionCount };
      case "transport":
        return { kind: "count", value: session.transportCount };
      case "events":
        // The one row that is an inbox rather than an inventory, and the only
        // one drawn in the accent colour.
        return unread > 0 ? { kind: "unread", value: unread } : undefined;
      default:
        return undefined;
    }
  };

  return (
    <nav
      aria-label="Views"
      className={cn(
        "bg-surface-0 flex shrink-0 flex-col overflow-hidden px-3 pt-1 pb-3",
        collapsed ? "w-[72px] items-center" : "w-[232px]",
        "transition-[width] duration-(--duration-base) ease-(--ease-out)",
      )}
    >
      <button
        type="button"
        onClick={() => openOverlay("palette")}
        title="Search nodes, keys and commands"
        className={cn(
          "rounded-control bg-surface-2 border-line mb-5 flex h-8 shrink-0 items-center border",
          "hover:bg-surface-3",
          transitionFast,
          focusRing,
          collapsed ? "w-8 justify-center" : "w-full gap-2.5 px-2.5",
        )}
      >
        <Search size={14} className="text-ink-muted shrink-0" />
        {collapsed ? null : (
          <>
            <span className="text-small text-ink-muted flex-1 text-left">Search or command</span>
            <Kbd combo="mod+k" />
          </>
        )}
      </button>

      <div className="flex w-full flex-col gap-px">
        {VIEWS.map((view, index) => {
          // A hairline wherever the group changes. The seam is the data's, not
          // a decision made here.
          const seam = index > 0 && VIEWS[index - 1]?.group !== view.group;

          return (
            <div key={view.id} className="contents">
              {seam ? (
                <div
                  aria-hidden
                  className={cn(
                    "bg-line-soft my-3 h-px shrink-0",
                    collapsed ? "w-6 self-center" : "mx-2.5",
                  )}
                />
              ) : null}
              <SidebarItem
                icon={view.icon}
                label={view.label}
                badge={badgeFor(view)}
                active={view.id === activeView}
                collapsed={collapsed}
                disabled={view.requiresSession !== false && !session}
                onClick={() => navigate(view.id)}
              />
            </div>
          );
        })}
      </div>

      <div className="min-h-6 flex-1" />

      <div
        aria-hidden
        className={cn("bg-line-soft mb-2 h-px shrink-0", collapsed ? "w-6 self-center" : "mx-2.5")}
      />
      <SidebarItem
        icon={Settings}
        label="Settings"
        collapsed={collapsed}
        onClick={() => openOverlay("settings")}
      />
    </nav>
  );
}
