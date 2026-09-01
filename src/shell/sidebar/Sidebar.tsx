import { ChevronDown, ChevronUp, Search, Settings } from "lucide-react";
import { useState } from "react";

import { Kbd } from "@/components/ui";
import { cn } from "@/lib/cn";
import { focusRingOnChrome, transitionFast } from "@/lib/states";
import { compactNumber } from "@/lib/format";
import { VIEW_GROUPS } from "@/navigation/groups";
import { PRIMARY_VIEWS, SECONDARY_VIEWS, VIEWS } from "@/navigation/views";
import type { ViewDefinition } from "@/navigation/types";
import { useActiveSession, useDiagnosticsStore, useUiStore } from "@/stores";
import { useNavigation } from "@/navigation/useNavigation";
import { SidebarItem } from "./SidebarItem";

/**
 * The primary navigation rail.
 *
 * Progressive disclosure runs the layout: the six views people use constantly
 * are always visible, and the rest sit behind "More". A flat list of ten would
 * be no faster to scan and considerably harder.
 */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const [moreOpen, setMoreOpen] = useState(false);

  const { view: activeView, navigate } = useNavigation();
  const session = useActiveSession();
  const unread = useDiagnosticsStore((state) => state.unread);

  /** Live counts shown against a view, when it has one worth showing. */
  const badgeFor = (view: ViewDefinition): string | number | undefined => {
    switch (view.id) {
      case "keyspace":
        // A running tap outranks the key count: it is the thing that is
        // happening, rather than the thing that is true.
        if (session && session.tapCount > 0) return "live";
        return session ? compactNumber(session.keyCount) : undefined;
      case "peers":
        return session ? session.transportCount : undefined;
      case "events":
        return unread > 0 ? unread : undefined;
      default:
        return undefined;
    }
  };

  const renderItem = (view: ViewDefinition) => (
    <SidebarItem
      key={view.id}
      icon={view.icon}
      label={view.label}
      badge={badgeFor(view)}
      badgeAccent={view.id === "events" || badgeFor(view) === "live"}
      active={view.id === activeView}
      collapsed={collapsed}
      disabled={view.requiresSession !== false && !session}
      title={view.description}
      onClick={() => navigate(view.id)}
    />
  );

  return (
    <nav
      aria-label="Views"
      className={cn(
        "bg-surface-0 flex shrink-0 flex-col gap-0.5 overflow-hidden px-3 pb-3",
        collapsed ? "w-[72px] items-center" : "w-[232px]",
        "transition-[width] duration-(--duration-base) ease-(--ease-out)",
      )}
    >
      <button
        type="button"
        onClick={() => openOverlay("palette")}
        title="Search nodes, keys and commands"
        className={cn(
          "rounded-control bg-surface-2 border-line mb-3 flex h-8 shrink-0 items-center border",
          "hover:bg-surface-3",
          transitionFast,
          focusRingOnChrome,
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

      {VIEW_GROUPS.map((group) => {
        const items = PRIMARY_VIEWS.filter((view) => view.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="contents">
            {collapsed ? (
              <div className="bg-line my-2 h-px w-6 shrink-0" aria-hidden />
            ) : (
              <h2 className="text-tiny text-ink-muted mt-4 mb-1 px-2.5 font-semibold tracking-wider uppercase">
                {group.label}
              </h2>
            )}
            {items.map(renderItem)}
          </div>
        );
      })}

      {SECONDARY_VIEWS.length > 0 ? (
        <>
          <SidebarItem
            icon={moreOpen ? ChevronUp : ChevronDown}
            label={moreOpen ? "Less" : "More"}
            collapsed={collapsed}
            onClick={() => setMoreOpen((open) => !open)}
            title={`${SECONDARY_VIEWS.length} more views`}
          />
          {moreOpen ? SECONDARY_VIEWS.map(renderItem) : null}
        </>
      ) : null}

      <div className="min-h-4 flex-1" />

      <SidebarItem
        icon={Settings}
        label="Settings"
        collapsed={collapsed}
        onClick={() => openOverlay("settings")}
      />
    </nav>
  );
}

/** Re-exported so the command palette can list the same views. */
export { VIEWS };
