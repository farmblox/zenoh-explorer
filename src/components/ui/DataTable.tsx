import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { transitionFast } from "@/lib/states";
import { ScrollArea } from "./ScrollArea";

/** One column: how to size it, what to title it, how to render a cell. */
export interface Column<Row> {
  readonly id: string;
  readonly header: string;
  /** Fixed width in pixels, or `"flex"` to take the remaining space. */
  readonly width: number | "flex";
  readonly align?: "left" | "right";
  readonly cell: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  /** Stable identity per row. Required — index keys break on prepend. */
  rowKey: (row: Row) => string | number;
  onSelect?: (row: Row) => void;
  selectedKey?: string | number | null;
  /** Rendered in place of the body when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/**
 * A dense, fixed-layout table.
 *
 * Columns are laid out with an explicit grid template rather than `<table>`
 * auto-layout, so column widths stay put as rows stream in — a table that
 * reflows on every batch during a live tap is unreadable.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onSelect,
  selectedKey,
  empty,
  className,
}: DataTableProps<Row>) {
  const template = columns
    .map((column) => (column.width === "flex" ? "minmax(0, 1fr)" : `${column.width}px`))
    .join(" ");

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        role="row"
        style={{ gridTemplateColumns: template }}
        className={cn(
          "border-line bg-surface-0 grid shrink-0 items-center gap-4 border-b px-5 py-2.5",
          "text-tiny text-ink-muted font-semibold tracking-wide uppercase",
        )}
      >
        {columns.map((column) => (
          <span
            key={column.id}
            role="columnheader"
            className={cn("truncate", column.align === "right" && "text-right")}
          >
            {column.header}
          </span>
        ))}
      </div>

      {rows.length === 0 && empty ? (
        <div className="flex-1">{empty}</div>
      ) : (
        <ScrollArea className="flex-1">
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey != null && key === selectedKey;
            return (
              <div
                key={key}
                role="row"
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={onSelect ? selected : undefined}
                onClick={onSelect ? () => onSelect(row) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(row);
                        }
                      }
                    : undefined
                }
                style={{ gridTemplateColumns: template }}
                className={cn(
                  "border-line-soft text-small grid h-9 items-center gap-4 border-b px-5",
                  onSelect && cn("cursor-pointer", transitionFast),
                  selected ? "bg-accent-subtle" : onSelect && "hover:bg-surface-2",
                )}
              >
                {columns.map((column) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn("truncate", column.align === "right" && "text-right")}
                  >
                    {column.cell(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </ScrollArea>
      )}
    </div>
  );
}
