import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { resizeHandle, resizeHandleLine, transitionFast } from "@/lib/states";
import { ScrollArea } from "./ScrollArea";
import { useColumnWidths } from "./useColumnWidths";

/** How much one arrow-key press moves a column edge. */
const KEYBOARD_STEP = 16;

/** One column: how to size it, what to title it, how to render a cell. */
export interface Column<Row> {
  readonly id: string;
  readonly header: string;
  /** Fixed width in pixels, or `"flex"` to take the remaining space. */
  readonly width: number | "flex";
  /**
   * Set `false` for a column whose width is not a preference — a glyph gutter,
   * a status dot. Widening one to 200px is a state nobody wants and everybody
   * can reach by accident.
   */
  readonly resizable?: boolean;
  readonly align?: "left" | "right";
  readonly cell: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  /**
   * Stable identity for this table.
   *
   * Column widths are remembered against it, so it has to name the table rather
   * than the screen it happens to be on.
   */
  id: string;
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
  id,
  columns,
  rows,
  rowKey,
  onSelect,
  selectedKey,
  empty,
  className,
}: DataTableProps<Row>) {
  const columnWidths = useColumnWidths(id);

  // Column headers describe cells. With no rows there are none, so the header
  // is a label for nothing — and an empty state reads as a stray caption under
  // a table that failed to load rather than as the whole answer.
  const showEmpty = rows.length === 0 && empty !== undefined;

  /** Rendered width for a column: a dragged override, else what it declares. */
  const widthOf = (column: Column<Row>): number | "flex" =>
    columnWidths.widths[column.id] ?? column.width;

  const template = columns
    .map((column) => {
      const width = widthOf(column);
      return width === "flex" ? "minmax(0, 1fr)" : `${width}px`;
    })
    .join(" ");

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {showEmpty ? null : (
        <div
          role="row"
          style={{ gridTemplateColumns: template }}
          className={cn(
            "border-line bg-surface-0 grid shrink-0 items-center gap-4 border-b px-5 py-2.5",
            "text-tiny text-ink-muted font-semibold tracking-wide uppercase",
          )}
        >
          {columns.map((column, index) => {
            const width = widthOf(column);
            // The last column has nothing to its right to take space from, so
            // dragging its edge would only move the table's own boundary.
            const resizable = column.resizable !== false && index < columns.length - 1;

            return (
              <span
                key={column.id}
                role="columnheader"
                className={cn("relative truncate", column.align === "right" && "text-right")}
              >
                {column.header}

                {resizable ? (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize the ${column.header} column`}
                    tabIndex={0}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      columnWidths.beginDrag(
                        column.id,
                        event.clientX,
                        // A flex column has no declared pixel width, so its
                        // rendered one is measured off the header cell.
                        width === "flex"
                          ? (event.currentTarget.parentElement?.offsetWidth ?? 120)
                          : width,
                      );
                    }}
                    onDoubleClick={() => columnWidths.reset(column.id)}
                    onKeyDown={(event) => {
                      const measured =
                        width === "flex"
                          ? (event.currentTarget.parentElement?.offsetWidth ?? 120)
                          : width;
                      if (event.key === "ArrowLeft")
                        columnWidths.nudge(column.id, measured, -KEYBOARD_STEP);
                      if (event.key === "ArrowRight")
                        columnWidths.nudge(column.id, measured, KEYBOARD_STEP);
                      if (event.key === "Home") columnWidths.reset(column.id);
                    }}
                    title="Drag to resize · double-click to reset"
                    className={cn(
                      resizeHandle,
                      // Sits in the gap between this column and the next, so it
                      // never overlaps a header's own text.
                      "-right-[13px]",
                      columnWidths.dragging === column.id
                        ? resizeHandleLine.active
                        : resizeHandleLine.idle,
                    )}
                  />
                ) : null}
              </span>
            );
          })}
        </div>
      )}

      {showEmpty ? (
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
