import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

/** Row density. `compact` is the scanning list; `comfortable` reads as content. */
export type ListRowSize = "compact" | "comfortable";

/** What the left mark says about the row, when it says anything. */
export type ListRowMark = "none" | "accent" | "ok" | "warn" | "danger";

const SIZES: Record<ListRowSize, string> = {
  compact: "h-[34px] px-4",
  comfortable: "min-h-10 px-4 py-2.5",
};

const MARKS: Record<ListRowMark, string> = {
  none: "border-l-transparent",
  accent: "border-l-accent",
  ok: "border-l-ok",
  warn: "border-l-warn",
  danger: "border-l-danger",
};

export interface ListRowProps {
  /** Glyph, dot or badge shown first. */
  icon?: ReactNode;
  /** The row's name. Truncates. */
  children: ReactNode;
  /** Trailing value — a count, a rate, a short identifier. */
  meta?: ReactNode;
  /** Renders `meta` in the monospace face. Default, since it is usually a value. */
  metaMono?: boolean;
  selected?: boolean | undefined;
  /** Colours the 2px left edge. Independent of selection, so a row can be both. */
  mark?: ListRowMark | undefined;
  size?: ListRowSize | undefined;
  onClick?: (() => void) | undefined;
  title?: string | undefined;
  className?: string | undefined;
}

/**
 * One selectable row in a side list.
 *
 * The same row appears in the node list, the config node picker and the saved
 * connections list, and it was hand-built in each. Three copies of a row is
 * three chances for its height, its hover and its selected state to drift
 * apart — and a list that behaves differently in three places is the kind of
 * thing nobody reports but everybody feels.
 *
 * The 2px left edge is a second channel alongside selection: a row can be
 * selected AND flagged, which a background colour alone cannot say.
 */
export function ListRow({
  icon,
  children,
  meta,
  metaMono = true,
  selected,
  mark = "none",
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
        "flex w-full items-center gap-2.5 border-l-2 text-left",
        SIZES[size],
        focusRing,
        transitionFast,
        selected ? "bg-accent-subtle" : "hover:bg-surface-2",
        // Selection owns the left edge unless the row is flagged for another
        // reason, in which case the flag is the more urgent thing to say.
        mark === "none" && selected ? "border-l-accent" : MARKS[mark],
        className,
      )}
    >
      {icon}
      <span className={cn("min-w-0 flex-1 truncate", selected ? "text-ink" : "text-ink-muted")}>
        {children}
      </span>
      {meta !== undefined && meta !== null ? (
        <span className={cn("text-tiny text-ink-faint shrink-0", metaMono && "numeric")}>
          {meta}
        </span>
      ) : null}
    </button>
  );
}
