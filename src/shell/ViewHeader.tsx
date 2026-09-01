import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ViewHeaderProps {
  title: string;
  /** One line of context under the title — counts, or what is being shown. */
  subtitle?: ReactNode;
  /** A short phrase naming something wrong, shown beside the title. */
  alert?: string | undefined;
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
 * The alert sits next to the title rather than in a banner because it belongs
 * to the subject, not to the screen: it is this network that has a problem, and
 * it should read that way whichever view you are on.
 */
export function ViewHeader({ title, subtitle, alert, actions, className }: ViewHeaderProps) {
  return (
    <header
      className={cn("border-line flex h-14 shrink-0 items-center gap-4 border-b px-5", className)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-title text-ink truncate font-medium tracking-tight">{title}</h1>
          {subtitle ? <p className="text-tiny text-ink-faint truncate">{subtitle}</p> : null}
        </div>
        {alert ? (
          <Badge tone="warn" dot className="shrink-0">
            {alert}
          </Badge>
        ) : null}
      </div>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
