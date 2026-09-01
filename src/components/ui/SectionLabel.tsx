import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SectionLabelProps {
  children: ReactNode;
  /** Trailing count or hint, right-aligned. */
  meta?: ReactNode;
  className?: string;
}

/**
 * The small heading that names a group of things.
 *
 * Uppercase at 12.5px with widened tracking — the one place in the app where
 * tracking opens up rather than tightening. That inversion is deliberate: it
 * makes a label unmistakably a label, so it never competes with the content
 * beneath it however dense that content gets.
 */
export function SectionLabel({ children, meta, className }: SectionLabelProps) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <h3 className="text-tiny text-ink-faint font-medium tracking-wide uppercase">{children}</h3>
      {meta !== undefined && meta !== null ? (
        <>
          <span className="flex-1" />
          <span className="numeric text-tiny text-ink-faint shrink-0">{meta}</span>
        </>
      ) : null}
    </div>
  );
}
