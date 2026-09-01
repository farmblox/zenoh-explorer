import { useCallback, useId, useRef, useState, type ReactNode } from "react";

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

const SIDES: Record<PopoverSide, string> = {
  bottom: "top-[calc(100%+5px)] origin-top",
  top: "bottom-[calc(100%+5px)] origin-bottom",
};

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

const ALIGNS: Record<PopoverAlign, string> = {
  start: "left-0",
  end: "right-0",
};

/**
 * A panel anchored to the control that opened it.
 *
 * Defined by its hairline, with only enough shadow to say it is above the page.
 * That is the rule for every floating layer here: the border separates, the
 * shadow only lifts.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  // Held on screen for one exit duration so the panel can animate away. Without
  // it the panel scales in and then disappears on a hard cut.
  const { mounted, state } = usePresence(open, EXIT_MS);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup={haspopup}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        // The ring is the component's, not the caller's: a trigger that is only
        // focusable-looking when someone remembers to pass a class is a trigger
        // that will be invisible to the keyboard somewhere.
        className={cn(focusRing, triggerClassName)}
      >
        {trigger}
      </button>

      {mounted ? (
        <div
          id={panelId}
          data-state={state}
          className={cn(
            "rounded-dialog border-line-elevated bg-surface-2 absolute z-30 border p-2",
            "shadow-popover",
            "motion-safe:data-[state=open]:animate-scale-in",
            "motion-safe:data-[state=closed]:animate-scale-out",
            SIDES[side],
            ALIGNS[align],
            className,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}
