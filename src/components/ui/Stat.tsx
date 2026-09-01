import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** How much room the number gets. */
export type StatSize = "sm" | "md" | "lg";

/** Semantic colour for the value. */
export type StatTone = "ink" | "accent" | "ok" | "warn" | "danger";

const VALUE_SIZES: Record<StatSize, string> = {
  sm: "text-base",
  md: "text-[1.375rem]",
  lg: "text-[1.5rem]",
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
export function Stat({ label, value, hint, size = "md", tone = "ink", className }: StatProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-tiny text-ink-faint truncate font-medium">{label}</p>
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
    </div>
  );
}

export interface StatGridProps {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

const COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
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
