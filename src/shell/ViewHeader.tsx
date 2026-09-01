import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface ViewHeaderProps {
  title: string;
  /** One line of context under the title — counts, or what is being shown. */
  subtitle?: ReactNode;
  /** Controls for the view, right-aligned. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The title row every view starts with.
 *
 * Shared rather than reimplemented per view so the vertical rhythm across
 * screens is identical — the title never shifts by a pixel when you switch
 * views, which is most of what makes navigation feel solid.
 *
 * Nothing about the network's health goes here. Coverage warnings live in the
 * status bar, which is on screen whichever view you are on — putting one in the
 * header too said the same thing twice, and reading it as part of the heading
 * made it look like a property of the screen rather than of the network.
 */
export function ViewHeader({ title, subtitle, actions, className }: ViewHeaderProps) {
  return (
    <header
      className={cn("border-line flex h-14 shrink-0 items-center gap-4 border-b px-5", className)}
    >
      <div className="min-w-0">
        <h1 className="text-title text-ink truncate font-medium tracking-tight">{title}</h1>
        {subtitle ? <p className="text-tiny text-ink-faint truncate">{subtitle}</p> : null}
      </div>

      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
