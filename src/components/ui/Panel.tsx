import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { SectionLabel } from "./SectionLabel";

export interface PanelProps {
  /** Section heading. Omit for an unlabelled container. */
  title?: string;
  /** Controls aligned to the right of the title. */
  actions?: ReactNode;
  /** Removes the body padding, for tables that draw their own. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** A bordered card. The default container for grouped content inside a view. */
export function Panel({ title, actions, flush, className, children }: PanelProps) {
  return (
    <section
      className={cn("rounded-panel border-line bg-surface-2 overflow-hidden border", className)}
    >
      {title || actions ? (
        <header className="border-line-soft flex h-11 items-center gap-3 border-b px-4">
          {title ? <SectionLabel>{title}</SectionLabel> : null}
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

export interface FieldRowProps {
  label: string;
  /** Renders the value in the monospace face. Default for identifiers. */
  mono?: boolean;
  children: ReactNode;
}

/** A label/value pair. The building block of every inspector panel. */
export function FieldRow({ label, mono = true, children }: FieldRowProps) {
  return (
    <div className="border-line-soft flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-small text-ink-muted shrink-0">{label}</span>
      <span className={cn("selectable text-small text-ink text-right", mono && "numeric")}>
        {children}
      </span>
    </div>
  );
}
