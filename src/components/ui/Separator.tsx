import { cn } from "@/lib/cn";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  /** Inset from the container's edges, so a rule does not touch a rounded corner. */
  inset?: boolean;
  className?: string;
}

/**
 * A rule between two groups of things.
 *
 * A component rather than a `<div className="h-px bg-line" />` because the app
 * had thirty of those, each picking its own colour, thickness and inset — which
 * is how a hairline ends up being three different greys on one screen.
 *
 * `aria-hidden`, because a rule is a visual grouping device and announcing it
 * tells a screen-reader user nothing they can act on.
 */
export function Separator({ orientation = "horizontal", inset, className }: SeparatorProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-line shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        inset && (orientation === "horizontal" ? "mx-2" : "my-2"),
        className,
      )}
    />
  );
}
