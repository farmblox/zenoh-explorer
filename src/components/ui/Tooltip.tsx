import { useId, useState, type ReactNode } from "react";

import { usePresence } from "@/hooks";
import { cn } from "@/lib/cn";

/** Which edge of the trigger the tip sits on. */
export type TooltipSide = "top" | "bottom";

export interface TooltipProps {
  /** What the tip says. Keep it to a phrase — this is not a place for prose. */
  content: ReactNode;
  side?: TooltipSide;
  /** Milliseconds of hover before it appears. */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

const SIDES: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+6px)] origin-bottom",
  bottom: "top-[calc(100%+6px)] origin-top",
};

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
 * The delay is the part that makes it feel considered: a tip that fires
 * instantly turns a sweep across a toolbar into a flicker of popups.
 */
export function Tooltip({ content, side = "top", delay = 500, className, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const { mounted, state } = usePresence(open, EXIT_MS);
  const id = useId();

  const show = () => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setOpen(true), delay));
  };

  const hide = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  };

  return (
    <span
      className={cn("relative inline-flex", className)}
      onPointerEnter={show}
      onPointerLeave={hide}
      // Focus arrives without a delay: a keyboard user asked for this control
      // deliberately, and has no pointer to sweep past it with.
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={hide}
      aria-describedby={mounted ? id : undefined}
    >
      {children}

      {mounted ? (
        <span
          id={id}
          role="tooltip"
          data-state={state}
          className={cn(
            "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap",
            "rounded-control border-line-elevated bg-surface-2 shadow-popover border px-2 py-1",
            "text-tiny text-ink font-medium",
            "motion-safe:data-[state=open]:animate-scale-in",
            "motion-safe:data-[state=closed]:animate-[var(--animate-scale-out)]",
            SIDES[side],
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
