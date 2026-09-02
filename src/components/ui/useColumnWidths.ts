import { useCallback, useEffect, useRef, useState } from "react";

/** Narrowest a column may be dragged, so one can never vanish entirely. */
export const MIN_COLUMN_WIDTH = 56;

/** Where a table's column widths are remembered. */
const storageKey = (id: string) => `zenoh-explorer.columns.${id}`;

export interface ColumnWidths {
  /** Overrides by column id. A column absent here keeps its declared width. */
  readonly widths: Readonly<Record<string, number>>;
  /** The column being dragged, for its handle's active state. */
  readonly dragging: string | null;
  /** Begins a drag, given the pointer's position and the column's width now. */
  readonly beginDrag: (columnId: string, pointerX: number, width: number) => void;
  /** Moves one column's edge by `delta`, for keyboard resizing. */
  readonly nudge: (columnId: string, width: number, delta: number) => void;
  /** Returns one column to the width its definition declares. */
  readonly reset: (columnId: string) => void;
}

/**
 * Per-table column widths that survive a restart.
 *
 * A column width is a lasting preference: someone who widens `Locator` to read
 * a long endpoint wants it wide tomorrow too. Stored per table id rather than
 * by column name, because the same name means different things in different
 * tables.
 *
 * A dragged column becomes fixed even if it was declared `"flex"`. Once you
 * have said how wide you want it, it should stop negotiating with its
 * neighbours over the leftover space.
 */
export function useColumnWidths(id: string): ColumnWidths {
  const [widths, setWidths] = useState<Record<string, number>>(() => read(id));
  const [dragging, setDragging] = useState<string | null>(null);

  /** Where the drag started, and how wide the column was then. */
  const origin = useRef<{ columnId: string; pointerX: number; width: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const from = origin.current;
      if (!from) return;
      const width = Math.max(
        MIN_COLUMN_WIDTH,
        Math.round(from.width + (event.clientX - from.pointerX)),
      );
      setWidths((previous) => ({ ...previous, [from.columnId]: width }));
    };

    const onUp = () => setDragging(null);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    // Holds the resize cursor and stops text selecting mid-drag, wherever the
    // pointer travels.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // Written when the drag ends rather than on every pointer move, which would
  // otherwise serialise a hundred times a second.
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(widths));
    } catch {
      // A browser with storage disabled still gets working columns; it just
      // forgets their widths between launches.
    }
  }, [dragging, widths, id]);

  const beginDrag = useCallback((columnId: string, pointerX: number, width: number) => {
    origin.current = { columnId, pointerX, width };
    setDragging(columnId);
  }, []);

  const nudge = useCallback((columnId: string, width: number, delta: number) => {
    setWidths((previous) => ({
      ...previous,
      [columnId]: Math.max(MIN_COLUMN_WIDTH, Math.round(width + delta)),
    }));
  }, []);

  const reset = useCallback((columnId: string) => {
    setWidths((previous) => {
      const next = { ...previous };
      delete next[columnId];
      return next;
    });
  }, []);

  return { widths, dragging, beginDrag, nudge, reset };
}

/** Stored widths for a table, ignoring anything that is not a usable number. */
function read(id: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
        )
        .map(([key, value]) => [key, Math.max(MIN_COLUMN_WIDTH, value)]),
    );
  } catch {
    return {};
  }
}
