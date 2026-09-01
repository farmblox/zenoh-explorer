import type { ComponentType } from "react";

import { StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";
import { focusRingOnChrome, transitionFast } from "@/lib/states";

/**
 * What the mark beside a row means.
 *
 * Three different facts used to share one grey numeral: how many things a view
 * holds, how many you have not read, and whether something is streaming right
 * now. They are not the same kind of news and they no longer look alike — a
 * count you can ignore, an unread you should clear, a stream you may be
 * watching.
 */
export type SidebarBadge =
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "unread"; readonly value: number }
  | { readonly kind: "live" };

export interface SidebarItemProps {
  icon: ComponentType<{ className?: string; size?: number }>;
  label: string;
  badge?: SidebarBadge | undefined;
  active?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  title?: string | undefined;
  onClick: () => void;
}

/**
 * One navigation row.
 *
 * Three states on a three-step ramp off the rail's own `surface-0`: nothing at
 * rest, `surface-1` under the pointer, `surface-2` for the view you are on. The
 * same ramp the session tabs use, and for the same reason — hover and selected
 * shared a fill, so every row looked selected in turn as the pointer crossed it.
 */
export function SidebarItem({
  icon: Icon,
  label,
  badge,
  active,
  collapsed,
  disabled,
  title,
  onClick,
}: SidebarItemProps) {
  /** Unread and live still have to reach you with the labels hidden. */
  const marker = badge?.kind === "unread" || badge?.kind === "live";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      // Collapsed rows have no visible label, so the tooltip carries it.
      title={collapsed ? label : title}
      className={cn(
        "rounded-control text-small flex h-[34px] w-full shrink-0 items-center whitespace-nowrap",
        focusRingOnChrome,
        transitionFast,
        collapsed ? "justify-center px-0" : "gap-3 px-2.5",
        disabled
          ? "text-ink-disabled pointer-events-none"
          : active
            ? "bg-surface-2 text-ink"
            : "text-ink-muted hover:bg-surface-1 hover:text-ink",
      )}
    >
      <span className="relative flex shrink-0 items-center">
        <Icon
          size={15}
          className={cn(disabled ? "text-ink-disabled" : active ? "text-accent" : "text-ink-faint")}
        />
        {collapsed && marker && !disabled ? (
          <span
            aria-hidden
            className={cn(
              "border-surface-0 absolute -top-0.5 -right-1 size-2 rounded-full border",
              badge.kind === "live" ? "bg-ok" : "bg-accent",
            )}
          />
        ) : null}
      </span>

      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {badge && !disabled ? <Mark badge={badge} /> : null}
        </>
      )}
    </button>
  );
}

/** The trailing mark: a quiet numeral, a loud pill, or a live dot. */
function Mark({ badge }: { badge: SidebarBadge }) {
  if (badge.kind === "live") {
    // The same dot the tabs and the status bar use for a live connection,
    // rather than the word "live" — one vocabulary for liveness.
    return <StatusDot status="live" pulse />;
  }

  if (badge.kind === "unread") {
    return (
      <span
        className={cn(
          "numeric bg-accent text-surface-0 rounded-full px-1.5 text-[10px] leading-[17px]",
          "min-w-[18px] text-center font-semibold",
        )}
      >
        {compactNumber(badge.value)}
      </span>
    );
  }

  // Tabular, so the counts line up as a column down the rail instead of
  // drifting with their digits.
  return (
    <span className="numeric text-tiny text-ink-faint tabular-nums">
      {compactNumber(badge.value)}
    </span>
  );
}
