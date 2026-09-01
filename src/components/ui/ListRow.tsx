import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

/** Row density. `compact` is the scanning list; `comfortable` reads as content. */
export type ListRowSize = "compact" | "comfortable";

const SIZES: Record<ListRowSize, string> = {
  compact: "h-8 px-2.5",
  comfortable: "min-h-9 px-2.5 py-2",
};

export interface ListRowProps {
  /** Glyph, dot or badge shown first. */
  icon?: ReactNode;
  /** The row's name. Truncates. */
  children: ReactNode;
  /** Trailing value — a count, a rate, a short identifier. */
  meta?: ReactNode;
  /** Renders `meta` in the monospace face. Default, since it is usually a value. */
  metaMono?: boolean | undefined;
  selected?: boolean | undefined;
  size?: ListRowSize | undefined;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
  className?: string | undefined;
}

/**
 * One selectable row in a side list.
 *
 * Shaped exactly like a sidebar item: inset, `rounded-control`, selection
 * carried by a tinted fill. The sidebar is the list people use most, so it is
 * what a list row IS in this app — a second, full-bleed shape elsewhere would
 * read as a different kind of thing without being one.
 *
 * There is deliberately no status marker. Whatever a row is flagged for — the
 * explorer's own session, a node needing attention — is already carried by the
 * icon it renders, and a second channel repeating that is an accessory.
 */
export function ListRow({
  icon,
  children,
  meta,
  metaMono = true,
  selected,
  size = "compact",
  onClick,
  title,
  className,
}: ListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "rounded-control text-small flex w-full items-center gap-2.5 text-left",
        SIZES[size],
        focusRing,
        transitionFast,
        selected ? "bg-accent-subtle text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta !== undefined && meta !== null ? (
        <span className={cn("text-tiny text-ink-faint shrink-0", metaMono && "numeric")}>
          {meta}
        </span>
      ) : null}
    </button>
  );
}
