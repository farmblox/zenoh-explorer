import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { focusRing, resizeHandle, resizeHandleLine, transitionFast } from "@/lib/states";
import { useColumnWidths } from "./useColumnWidths";

/** How much one arrow-key press moves a column edge. */
const KEYBOARD_STEP = 16;

/**
 * Row height, in pixels.
 *
 * Fixed, and a number rather than a class, because the virtualizer has to know
 * it to place a row without measuring one. Every row being the same height is
 * also what lets a table of a million rows scroll smoothly.
 */
const ROW_HEIGHT = 36;

/**
 * Height of an expanded row's detail.
 *
 * Fixed, for the same reason the row height is: the virtualizer has to know it
 * without measuring, and a live table cannot afford to re-measure while rows
 * arrive. The detail scrolls inside this.
 */
const DETAIL_HEIGHT = 232;

/** Rows kept mounted beyond the viewport, so a fast scroll finds them ready. */
const OVERSCAN = 12;

/** How close to the bottom still counts as "at the bottom", in pixels. */
const PINNED_SLACK = 24;

/**
 * Narrowest a flexible column may be squeezed to.
 *
 * Below this the header reads as an ellipsis and the column says nothing. When
 * the columns no longer fit, the table scrolls sideways instead — a side panel
 * opening must not silently delete a column's content.
 */
const MIN_FLEX_WIDTH = 130;

/** Horizontal gap between columns, in pixels. Mirrors the `gap-4` below. */
const COLUMN_GAP = 16;

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
  /**
   * Detail for the selected row, rendered inline beneath it.
   *
   * An expanding row rather than a side panel: this table is often the widest
   * thing on screen, and a panel beside it either squeezes the columns to
   * nothing or pushes itself off the edge. Expanding keeps the row you clicked
   * where you clicked it.
   *
   * The detail gets a fixed height and scrolls inside itself. Measuring it
   * instead would mean re-measuring while rows stream in, which is how a live
   * table starts fighting the scroll position.
   */
  renderDetail?: (row: Row) => ReactNode;
  /**
   * Keeps the newest rows in view as they arrive.
   *
   * For a table fed by a live stream. Following stops the moment the reader
   * scrolls away from the bottom — a table that yanks itself back while you are
   * reading is worse than one that never followed — and resumes when they
   * return to it, or press the button this puts on screen.
   */
  follow?: boolean;
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
  renderDetail,
  follow = false,
  className,
}: DataTableProps<Row>) {
  const columnWidths = useColumnWidths(id);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Whether the reader is still at the bottom, and so still being followed. */
  const [pinned, setPinned] = useState(true);

  // React Compiler cannot memoize a hook that returns functions, so it skips
  // this component. That is the right trade here rather than a problem to fix:
  // only the visible slice of rows is ever mounted, so re-rendering the table
  // costs a few dozen nodes — which is the whole reason the virtualizer is
  // here. Memoising it would save less than measuring it would cost.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      if (renderDetail === undefined || selectedKey == null) return ROW_HEIGHT;
      const row = rows[index];
      const expanded = row !== undefined && rowKey(row) === selectedKey;
      return expanded ? ROW_HEIGHT + DETAIL_HEIGHT : ROW_HEIGHT;
    },
    overscan: OVERSCAN,
  });

  // Sizes are cached by index, so two things have to invalidate them. Expanding
  // a row, obviously — the rows below it would otherwise keep the offsets they
  // had while it was closed. And the row count, because a live table evicts
  // from the front: every index then names a different row, and the cached tall
  // one would be applied to whichever row inherited that index.
  //
  // Only when there is a detail to expand. Without one every row is the same
  // height and there is nothing a stale measurement could get wrong.
  useEffect(() => {
    if (renderDetail !== undefined) virtualizer.measure();
    // `virtualizer` is recreated each render, so it cannot be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, rows.length]);

  // Whether following is on is the reader's business, decided by where they
  // have scrolled to rather than by a mode they have to remember to set.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !follow) return;

    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      setPinned(distance <= PINNED_SLACK);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [follow]);

  // Ride the tail while pinned. Keyed on the row count, so it runs when rows
  // arrive rather than on every render.
  useEffect(() => {
    if (!follow || !pinned || rows.length === 0) return;
    virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
  }, [follow, pinned, rows.length, virtualizer]);

  const jumpToLatest = useCallback(() => {
    setPinned(true);
    if (rows.length > 0) virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
  }, [rows.length, virtualizer]);

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
      return width === "flex" ? `minmax(${MIN_FLEX_WIDTH}px, 1fr)` : `${width}px`;
    })
    .join(" ");

  /**
   * Width below which the table scrolls rather than shrinks.
   *
   * Every column at its declared or minimum width, plus the gaps and the row
   * padding. Applied to the header and the row spacer alike so the two cannot
   * disagree about where a column starts.
   */
  const minWidth =
    columns.reduce((total, column) => {
      const width = widthOf(column);
      return total + (width === "flex" ? MIN_FLEX_WIDTH : width);
    }, 0) +
    COLUMN_GAP * Math.max(0, columns.length - 1) +
    40;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {showEmpty ? (
        <div className="flex-1">{empty}</div>
      ) : (
        // One scroll container for the header and the rows, so a sideways
        // scroll moves both. A header outside it would stay put while the
        // columns beneath it slid away.
        <div ref={scrollRef} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
          <div
            role="row"
            style={{ gridTemplateColumns: template, minWidth }}
            className={cn(
              "border-line bg-surface-0 sticky top-0 z-10 grid items-center gap-4 border-b px-5 py-2.5",
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
                  // NOT `truncate` here: that sets `overflow: hidden`, which
                  // clips the resize handle sitting just outside this cell and
                  // makes it both invisible and impossible to grab. The label
                  // truncates on its own element instead.
                  className={cn("relative min-w-0", column.align === "right" && "text-right")}
                >
                  <span className="block truncate">{column.header}</span>

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
                            ? (event.currentTarget.parentElement?.offsetWidth ?? MIN_FLEX_WIDTH)
                            : width,
                        );
                      }}
                      onDoubleClick={() => columnWidths.reset(column.id)}
                      onKeyDown={(event) => {
                        const measured =
                          width === "flex"
                            ? (event.currentTarget.parentElement?.offsetWidth ?? MIN_FLEX_WIDTH)
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
                        // Sits in the gap between this column and the next, so
                        // it never overlaps a header's own text.
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

          {/* One tall spacer holding every row's worth of height, with only the
              visible slice actually in the DOM. It is the positioned ancestor
              for the rows, so `inset-x-0` spans the table's real width rather
              than the viewport's. */}
          <div className="relative" style={{ height: virtualizer.getTotalSize(), minWidth }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (row === undefined) return null;
              const key = rowKey(row);
              const selected = selectedKey != null && key === selectedKey;

              const expanded = renderDetail !== undefined && selected;

              return (
                <div
                  key={key}
                  style={{
                    // Positioned rather than laid out, so adding a row never
                    // reflows the ones already on screen.
                    transform: `translateY(${item.start}px)`,
                  }}
                  className="absolute inset-x-0 top-0"
                >
                  <div
                    role="row"
                    tabIndex={onSelect ? 0 : undefined}
                    aria-selected={onSelect ? selected : undefined}
                    aria-expanded={renderDetail === undefined ? undefined : selected}
                    aria-rowindex={item.index + 1}
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
                    style={{ gridTemplateColumns: template, height: ROW_HEIGHT }}
                    className={cn(
                      "border-line-soft text-small group relative grid items-center gap-4 border-b px-5",
                      onSelect && cn("cursor-pointer", transitionFast),
                      selected ? "bg-accent-subtle" : onSelect && "hover:bg-surface-2",
                    )}
                  >
                    {/* Overlaid in the row's own left padding rather than given a
                        column of its own. A 14px column would also cost the
                        grid's 16px gap, which is 30px of horizontal budget in
                        an already dense table — and it would reflow every other
                        table that uses this one without a detail. */}
                    {renderDetail === undefined ? null : (
                      <ChevronRight
                        size={12}
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute top-1/2 left-1 -mt-1.5 shrink-0",
                          "transition-transform duration-(--duration-fast)",
                          selected
                            ? "text-ink rotate-90"
                            : "text-ink-faint group-hover:text-ink-muted",
                        )}
                      />
                    )}
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

                  {expanded ? (
                    <div
                      style={{ height: DETAIL_HEIGHT }}
                      className="border-line bg-surface-1 scroll-thin overflow-auto border-b"
                    >
                      {renderDetail(row)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Only offered once following has actually stopped, so it is never a
              button that does nothing. */}
          {follow && !pinned ? (
            <button
              type="button"
              onClick={jumpToLatest}
              className={cn(
                "rounded-control border-line bg-surface-2 text-tiny text-ink sticky bottom-4 left-[calc(100%-9rem)]",
                "shadow-popover flex items-center gap-1.5 border px-2.5 py-1.5 font-medium",
                focusRing,
                transitionFast,
              )}
            >
              <ArrowDown size={12} />
              Jump to latest
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
