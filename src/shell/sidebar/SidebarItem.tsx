import type { ComponentType } from "react";

import { cn } from "@/lib/cn";
import { focusRingOnChrome, transitionFast } from "@/lib/states";

export interface SidebarItemProps {
  icon: ComponentType<{ className?: string; size?: number }>;
  label: string;
  /** Right-aligned count or status word. Hidden when collapsed. */
  badge?: string | number | undefined;
  /** Draws the badge in the accent colour, for live or unread state. */
  badgeAccent?: boolean;
  active?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  title?: string | undefined;
  onClick: () => void;
}

/** One navigation row. Collapses to an icon when the sidebar narrows. */
export function SidebarItem({
  icon: Icon,
  label,
  badge,
  badgeAccent,
  active,
  collapsed,
  disabled,
  title,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      // Collapsed rows have no visible label, so the tooltip carries it.
      title={collapsed ? label : title}
      className={cn(
        "rounded-control text-small flex h-8 w-full shrink-0 items-center whitespace-nowrap",
        focusRingOnChrome,
        transitionFast,
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon size={15} className={cn("shrink-0", active ? "text-accent" : "text-ink-faint")} />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {badge != null ? (
            <span
              className={cn(
                "numeric text-tiny font-medium",
                badgeAccent ? "text-accent" : "text-ink-muted",
              )}
            >
              {badge}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}
