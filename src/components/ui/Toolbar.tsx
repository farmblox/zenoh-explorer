import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface ToolbarProps {
  /** Controls, left to right. Wrap a `<span className="flex-1" />` to push right. */
  children: ReactNode;
  className?: string;
}

/**
 * The control strip a view puts above its content.
 *
 * Separated by the softer of the two hairlines: it belongs to the content below
 * it, not to the header above, and a full-strength rule here would read as a
 * second header.
 */
export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "border-line-soft flex shrink-0 items-center gap-2.5 border-b px-6 py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A vertical hairline between groups of controls in a toolbar or status bar. */
export function ToolbarDivider() {
  return <span className="bg-line h-4 w-px shrink-0" aria-hidden />;
}
