import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Which axis may scroll. Defaults to vertical only. */
  axis?: "y" | "x" | "both";
}

const AXIS: Record<NonNullable<ScrollAreaProps["axis"]>, string> = {
  y: "overflow-y-auto overflow-x-hidden",
  x: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto",
};

/**
 * A scrolling region with the app's thin scrollbar.
 *
 * `min-h-0` is not incidental: without it a flex child refuses to shrink below
 * its content and scrolls the window instead of itself.
 */
export function ScrollArea({ axis = "y", className, children, ...props }: ScrollAreaProps) {
  return (
    <div className={cn("scroll-thin min-h-0 min-w-0", AXIS[axis], className)} {...props}>
      {children}
    </div>
  );
}
