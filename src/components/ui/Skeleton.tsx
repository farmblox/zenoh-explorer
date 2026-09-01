import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * Preferred over a spinner wherever the shape is known — a table of rows, a
 * card, a line of text. A spinner says "wait"; a skeleton says "wait, and here
 * is what you are waiting for", and it keeps the layout from jumping when the
 * content lands.
 *
 * `motion-safe`, so a reduced-motion preference gets a still block rather than
 * a pulsing one.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn("bg-fill rounded-control motion-safe:animate-pulse", className)}
    />
  );
}
