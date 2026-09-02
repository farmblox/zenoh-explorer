import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDismiss, usePresence } from "@/hooks";
import { cn } from "@/lib/cn";
import { focusRing } from "@/lib/states";

/** Which edge of the trigger the panel grows from. */
export type PopoverSide = "top" | "bottom";
/** Which edge of the trigger the panel lines up with. */
export type PopoverAlign = "start" | "end";

export interface PopoverRenderProps {
  /** Closes the panel — pass to anything inside that completes an action. */
  close: () => void;
}

export interface PopoverProps {
  /** The trigger's content. */
  trigger: ReactNode;
  /** Accessible name for the trigger. */
  label: string;
  children: ReactNode | ((props: PopoverRenderProps) => ReactNode);
  side?: PopoverSide | undefined;
  align?: PopoverAlign | undefined;
  /**
   * What kind of thing the panel is, for assistive technology.
   *
   * `dialog` for a panel of controls, `listbox` when the panel is a list of
   * values to choose from.
   */
  haspopup?: "dialog" | "listbox" | "menu" | undefined;
  /** Class for the trigger button. */
  triggerClassName?: string | undefined;
  /** Class for the floating panel. */
  className?: string | undefined;
}

const ORIGINS: Record<PopoverSide, string> = {
  bottom: "origin-top",
  top: "origin-bottom",
};

/** Distance from the trigger's edge. */
const GAP = 5;

/** Closest the panel may come to the window's edge. */
const MARGIN = 8;

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

/**
 * A panel anchored to the control that opened it.
 *
 * Defined by its hairline, with only enough shadow to say it is above the page.
 * That is the rule for every floating layer here: the border separates, the
 * shadow only lifts.
 *
 * The panel is portalled to a measured position rather than positioned inside
 * the trigger, because anything that clips its own overflow would clip it: a
 * dialog does, and a dropdown near its edge came out cut in half.
 *
 * Where it portals TO matters. `showModal()` puts a `<dialog>` in the browser's
 * top layer, and the top layer is above every normal-flow element whatever its
 * z-index — so a panel sent to `document.body` from inside a dialog renders
 * behind it. Inside a dialog it goes into the dialog element itself, which is
 * in the top layer and does not clip; everywhere else it goes to the body.
 */
export function Popover({
  trigger,
  label,
  children,
  side = "bottom",
  align = "start",
  haspopup = "dialog",
  triggerClassName,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  // Both parts: the panel lives in a portal, so a click inside it is not
  // inside the container.
  useDismiss([containerRef, panelRef], open, close);

  // Held on screen for one exit duration so the panel can animate away. Without
  // it the panel scales in and then disappears on a hard cut.
  const { mounted, state } = usePresence(open, EXIT_MS);

  // The panel's width is its content's, so whether it fits is only knowable
  // once it is on screen. Measured and nudged in a layout effect, before the
  // browser paints — a panel that appears off the edge and then jumps back is
  // worse than one that was never off it.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!mounted || !panel) return;

    const bounds = panel.getBoundingClientRect();
    const overshoot = bounds.right - (window.innerWidth - MARGIN);
    if (overshoot > 0) panel.style.left = `${Math.max(MARGIN, bounds.left - overshoot)}px`;
    if (bounds.left < MARGIN) panel.style.left = `${MARGIN}px`;
  }, [mounted, rect]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup={haspopup}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          const trigger = containerRef.current;
          setRect(trigger?.getBoundingClientRect() ?? null);
          // The nearest open dialog, or the body. Resolved per open rather than
          // once, because the same control can be used in both places.
          setHost(trigger?.closest("dialog") ?? document.body);
          setOpen((current) => !current);
        }}
        // The ring is the component's, not the caller's: a trigger that is only
        // focusable-looking when someone remembers to pass a class is a trigger
        // that will be invisible to the keyboard somewhere.
        className={cn(focusRing, triggerClassName)}
      >
        {trigger}
      </button>

      {mounted && rect && host
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              data-state={state}
              style={{
                position: "fixed",
                top: side === "bottom" ? rect.bottom + GAP : undefined,
                bottom: side === "top" ? window.innerHeight - rect.top + GAP : undefined,
                left: align === "start" ? rect.left : undefined,
                right: align === "end" ? window.innerWidth - rect.right : undefined,
              }}
              className={cn(
                "rounded-dialog border-line-elevated bg-surface-2 z-50 border p-2",
                "shadow-popover",
                "motion-safe:data-[state=open]:animate-scale-in",
                "motion-safe:data-[state=closed]:animate-scale-out",
                ORIGINS[side],
                className,
              )}
            >
              {typeof children === "function" ? children({ close }) : children}
            </div>,
            host,
          )
        : null}
    </div>
  );
}
