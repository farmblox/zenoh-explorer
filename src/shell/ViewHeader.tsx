import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface ViewHeaderProps {
  title: string;
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
 * The name of the screen and nothing else. Counts belong to the content that
 * has them — the sidebar badges, the toolbars, the tables — and a description
 * of a screen you are already looking at is a line to read past every time you
 * arrive. Nothing about the network's health goes here either: coverage
 * warnings live in the status bar, which is on screen whichever view you are
 * on, and reading one as part of a heading made it look like a property of the
 * screen rather than of the network.
 */
export function ViewHeader({ title, actions, className }: ViewHeaderProps) {
  return (
    <header
      className={cn("border-line flex h-14 shrink-0 items-center gap-4 border-b px-5", className)}
    >
      <h1 className="text-title text-ink min-w-0 truncate font-medium tracking-tight">{title}</h1>

      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
