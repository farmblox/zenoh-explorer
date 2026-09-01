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

/**
 * Shown wherever a view has nothing to display.
 *
 * Fills whatever slot it is given rather than sizing to its own text. As a flex
 * item it was `flex-none`, so it took the width of its longest line and centred
 * within THAT — which put the message a third of the way across a wide pane and
 * read as a layout mistake rather than a considered empty screen. `flex-1`
 * covers a flex parent on either axis and `size-full` covers a block one.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex size-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center",
        "gap-3 px-8 py-16 text-center",
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
