import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { usePresence } from "@/hooks";
import { cn } from "@/lib/cn";

/** Which edge of the trigger the tip sits on. */
export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  /** What the tip says. A phrase, or a small block for a control with no label. */
  content: ReactNode;
  side?: TooltipSide;
  /** Milliseconds of hover before it appears. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

/** Distance from the trigger's edge. */
const GAP = 8;

/** Where the scale animation grows from, per side. */
const ORIGINS: Record<TooltipSide, string> = {
  top: "origin-bottom",
  bottom: "origin-top",
  left: "origin-right",
  right: "origin-left",
};

/** Fixed-position style for a tip on `side` of `rect`. */
function place(side: TooltipSide, rect: DOMRect): React.CSSProperties {
  switch (side) {
    case "top":
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - GAP,
        transform: "translate(-50%, -100%)",
      };
    case "bottom":
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + GAP,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: rect.left - GAP,
        top: rect.top + rect.height / 2,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: rect.right + GAP,
        top: rect.top + rect.height / 2,
        transform: "translate(0, -50%)",
      };
  }
}

/**
 * A label that appears on hover, for a control whose meaning is not on it.
 *
 * Replaces the native `title` attribute, which the app leaned on in about forty
 * places. `title` has no styling, no theme, a delay the platform picks, and it
 * never appears for a keyboard user at all — which makes it an accessibility
 * gap dressed as a convenience.
 *
 * Opens on hover AND on focus, so the keyboard gets the same information the
 * pointer does, and is wired with `aria-describedby` so a screen reader reads
 * it as a description of the control rather than as loose text nearby.
 *
 * Rendered into `document.body` at a measured position rather than positioned
 * inside the trigger. A tip belongs to the window, not to whatever box happens
 * to contain the control: the collapsed nav rail clips its own overflow — it
 * has to, because its width animates — so a tip drawn inside it would be a tip
 * nobody ever sees.
 *
 * The delay is the part that makes it feel considered: a tip that fires
 * instantly turns a sweep across a toolbar into a flicker of popups. Pass a
 * short one where the tip is the only label a control has, and the sweep
 * argument stops applying.
 */
export function Tooltip({ content, side = "top", delay = 500, className, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const { mounted, state } = usePresence(open, EXIT_MS);
  const id = useId();

  const measure = () => setRect(trigger.current?.getBoundingClientRect() ?? null);

  const show = (immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      measure();
      setOpen(true);
      return;
    }
    timer.current = setTimeout(() => {
      measure();
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };

  // A measured position goes stale the moment anything moves, and a tip that
  // has drifted away from its control is worse than no tip. Closing is the
  // honest response — whatever the reader is now doing, it is not reading this.
  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <span
      ref={trigger}
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => show()}
      onPointerLeave={hide}
      // Focus arrives without a delay: a keyboard user asked for this control
      // deliberately, and has no pointer to sweep past it with.
      onFocusCapture={() => show(true)}
      onBlurCapture={hide}
      aria-describedby={mounted ? id : undefined}
    >
      {children}

      {mounted && rect
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              data-state={state}
              style={place(side, rect)}
              className={cn(
                "pointer-events-none fixed z-50 max-w-[17rem]",
                "rounded-control border-line-elevated bg-surface-2 shadow-popover border px-2.5 py-1.5",
                "text-tiny text-ink font-medium",
                "motion-safe:data-[state=open]:animate-scale-in",
                "motion-safe:data-[state=closed]:animate-[var(--animate-scale-out)]",
                ORIGINS[side],
              )}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
