import type { ComponentType } from "react";

import { StatusDot, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";
import { focusRing, transitionFast } from "@/lib/states";

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
  onClick: () => void;
}

/**
 * One navigation row.
 *
 * Nothing at rest, a translucent overlay under the pointer, a stronger one for
 * the view you are on. Both are directional tokens rather than rungs on the
 * surface ladder: on the dark theme they lighten the row, on the light theme
 * they darken it, which is what emphasis means on each. Naming a fixed surface
 * instead put a white row on a near-white rail in light mode.
 */
export function SidebarItem({
  icon: Icon,
  label,
  badge,
  active,
  collapsed,
  disabled,
  onClick,
}: SidebarItemProps) {
  /** Unread and live still have to reach you with the labels hidden. */
  const marker = badge?.kind === "unread" || badge?.kind === "live";

  const row = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-control text-small flex h-[34px] w-full shrink-0 items-center whitespace-nowrap",
        focusRing,
        transitionFast,
        collapsed ? "justify-center px-0" : "gap-3 px-2.5",
        disabled
          ? "text-ink-disabled pointer-events-none"
          : active
            ? "bg-selected text-ink"
            : "text-ink-muted hover:bg-overlay-hover hover:text-ink",
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

  // Collapsed, the row shows an icon and no name, so the tip is the name.
  // Expanded it would be repeating a label that is already on screen.
  if (!collapsed) return row;

  return (
    <Tooltip content={label} side="right" delay={120} className="w-full">
      {row}
    </Tooltip>
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
