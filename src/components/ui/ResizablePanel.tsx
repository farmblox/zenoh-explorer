import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { resizeHandle, resizeHandleLine } from "@/lib/states";

/** Which edge the panel is attached to — the opposite edge gets the handle. */
export type PanelSide = "left" | "right";

export interface ResizablePanelProps {
  /** Stable id. The width is remembered per id, across sessions. */
  id: string;
  side: PanelSide;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Accessible name for the resize handle, e.g. "Resize the node list". */
  label: string;
  className?: string;
  children: ReactNode;
}

/** How much one arrow-key press moves the edge. */
const KEYBOARD_STEP = 16;

/** Where widths are remembered. */
const storageKey = (id: string) => `zenoh-explorer.panel-width.${id}`;

/**
 * A side panel the user can drag wider or narrower.
 *
 * Widths persist per panel, because a preferred width is a lasting preference —
 * someone who widens the node list to read long names wants it wide tomorrow
 * too. Reading from storage happens once, lazily, so a panel never renders at
 * the default and then jumps.
 *
 * The handle is a real focusable separator with arrow-key support. A drag
 * affordance that only works with a mouse is not an affordance for everyone.
 */
export function ResizablePanel({
  id,
  side,
  defaultWidth,
  minWidth = 220,
  maxWidth = 640,
  label,
  className,
  children,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => readStoredWidth(id, defaultWidth, minWidth, maxWidth));
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback(
    (value: number) => Math.min(maxWidth, Math.max(minWidth, Math.round(value))),
    [minWidth, maxWidth],
  );

  const commit = useCallback(
    (value: number) => {
      const next = clamp(value);
      setWidth(next);
      try {
        localStorage.setItem(storageKey(id), String(next));
      } catch {
        // A browser with storage disabled still gets a working panel; it just
        // forgets the width between launches.
      }
    },
    [clamp, id],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Measured from the panel's anchored edge, so the width tracks the
      // pointer exactly however the surrounding layout is arranged.
      setWidth(clamp(side === "left" ? event.clientX - rect.left : rect.right - event.clientX));
    };

    const onUp = () => setDragging(false);

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    // Keeps the resize cursor and stops text selecting mid-drag, whatever the
    // pointer happens to be over.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, clamp, side]);

  // The dragged width is only written once the drag ends: storing on every
  // pointer move would write a hundred times a second.
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(storageKey(id), String(width));
    } catch {
      // Same as above — a lost preference is not worth failing over.
    }
  }, [dragging, id, width]);

  return (
    <div
      ref={panelRef}
      style={{ width }}
      className={cn("relative flex shrink-0 flex-col", className)}
    >
      {children}

      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={() => commit(defaultWidth)}
        onKeyDown={(event) => {
          const towards = side === "left" ? 1 : -1;
          if (event.key === "ArrowLeft") commit(width - KEYBOARD_STEP * towards);
          if (event.key === "ArrowRight") commit(width + KEYBOARD_STEP * towards);
          if (event.key === "Home") commit(defaultWidth);
        }}
        title="Drag to resize · double-click to reset"
        className={cn(
          resizeHandle,
          side === "left" ? "-right-[5px]" : "-left-[5px]",
          dragging ? resizeHandleLine.active : resizeHandleLine.idle,
        )}
      />
    </div>
  );
}

/** The remembered width, falling back to the default when there is not one. */
function readStoredWidth(id: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(localStorage.getItem(storageKey(id)));
    if (Number.isFinite(stored) && stored > 0) return Math.min(max, Math.max(min, stored));
  } catch {
    // Fall through to the default.
  }
  return fallback;
}
