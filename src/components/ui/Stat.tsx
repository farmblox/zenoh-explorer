import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

/** How much room the number gets. */
export type StatSize = "sm" | "md" | "lg";

/** Semantic colour for the value. */
export type StatTone = "ink" | "accent" | "ok" | "warn" | "danger";

const VALUE_SIZES: Record<StatSize, string> = {
  sm: "text-base",
  md: "text-metric",
  lg: "text-metric-lg",
};

const TONES: Record<StatTone, string> = {
  ink: "text-ink",
  accent: "text-accent-strong",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export interface StatProps {
  label: string;
  value: ReactNode;
  /** One line under the value: units, source, or what it is measured against. */
  hint?: ReactNode;
  size?: StatSize;
  tone?: StatTone;
  /**
   * Makes the stat a control that opens what it counted.
   *
   * A counter is a summary of something, and the obvious question about a
   * summary is "which ones". Given this, the stat becomes a button and grows a
   * caret; without it, it stays a number.
   */
  onClick?: () => void;
  /** Whether what this stat counts is currently open. */
  open?: boolean;
  className?: string;
}

/**
 * One measured number, labelled.
 *
 * Label above, value below, in the monospace face at a tight tracking — a
 * counter read at a glance, not a sentence. Every counter surface in the app is
 * built from these so that a rate in Scouting and a rate in Transport are the
 * same size and weight, and can be compared without recalibrating.
 */
export function Stat({
  label,
  value,
  hint,
  size = "md",
  tone = "ink",
  onClick,
  open,
  className,
}: StatProps) {
  // A button only when there is something to open. A stat rendered as a
  // control that does nothing is worse than a number: it invites a click and
  // then does not answer it.
  const Root = onClick ? "button" : "div";

  return (
    <Root
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-expanded={onClick ? open : undefined}
      className={cn(
        "min-w-0",
        // A translucent fill rather than a named surface: `StatCell` already
        // paints itself `surface-2`, so `hover:bg-surface-2` would be a hover
        // state you cannot see. This layers over whatever is underneath, which
        // is the only thing a primitive can assume about its own background.
        onClick && cn("w-full text-left", focusRing, transitionFast, "hover:bg-selected"),
        onClick && open && "bg-selected",
        className,
      )}
    >
      <p className="text-tiny text-ink-faint flex items-center gap-1 truncate font-medium">
        <span className="truncate">{label}</span>
        {onClick ? (
          <ChevronRight
            size={11}
            aria-hidden
            className={cn(
              "shrink-0 transition-transform duration-(--duration-fast)",
              open && "rotate-90",
            )}
          />
        ) : null}
      </p>
      <p
        className={cn(
          "numeric tracking-title mt-1.5 truncate font-medium",
          VALUE_SIZES[size],
          TONES[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-tiny text-ink-faint mt-1.5 truncate">{hint}</p> : null}
    </Root>
  );
}

export interface StatGridProps {
  columns?: 2 | 3 | 4 | 5;
  className?: string;
  children: ReactNode;
}

const COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  // Five, because Zenoh declares exactly five kinds of interest in a key and
  // the keyspace shows one tile per kind.
  5: "grid-cols-5",
} as const;

/**
 * Stats laid out as a hairline-ruled grid.
 *
 * The rules come from the gap showing the container through, rather than from
 * borders on each cell — one line between neighbours instead of two stacked.
 */
export function StatGrid({ columns = 2, className, children }: StatGridProps) {
  return (
    <div className={cn("bg-line-soft grid gap-px", COLUMNS[columns], className)}>{children}</div>
  );
}

/** A stat as a cell of `StatGrid`. Carries the surface the grid rules against. */
export function StatCell({ className, ...props }: StatProps) {
  return <Stat {...props} className={cn("bg-surface-2 p-4", className)} />;
}
