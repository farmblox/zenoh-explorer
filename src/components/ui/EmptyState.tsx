import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /**
   * What to do about it. An empty view without a next step is a dead end, so
   * this is required rather than optional.
   */
  description: string;
  action?: ReactNode;
  className?: string;
}

/** Shown wherever a view has nothing to display. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 px-8 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-faint [&_svg]:size-6">{icon}</div> : null}
      <div className="space-y-1.5">
        <p className="text-ink text-base font-medium">{title}</p>
        <p className="text-small text-ink-faint max-w-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}
