import { useCallback, useId, useRef, useState, type ReactNode } from "react";

import { useDismiss } from "@/hooks";
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
  /** Class for the trigger button. */
  triggerClassName?: string | undefined;
  /** Class for the floating panel. */
  className?: string | undefined;
}

const SIDES: Record<PopoverSide, string> = {
  bottom: "top-[calc(100%+5px)] origin-top",
  top: "bottom-[calc(100%+5px)] origin-bottom",
};

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
  triggerClassName,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        // The ring is the component's, not the caller's: a trigger that is only
        // focusable-looking when someone remembers to pass a class is a trigger
        // that will be invisible to the keyboard somewhere.
        className={cn(focusRing, triggerClassName)}
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={panelId}
          className={cn(
            "rounded-panel border-line bg-surface-2 absolute z-30 border p-1.5",
            "shadow-popover animate-scale-in",
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
