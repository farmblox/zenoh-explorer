import { useId } from "react";

import { cn } from "@/lib/cn";
import { transitionFast } from "@/lib/states";

export interface CheckboxProps {
  label: string;
  /** One line explaining what ticking it changes. */
  hint?: string;
  checked: boolean;
  /** Neither on nor off — for a parent whose children disagree. */
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/**
 * A tick box.
 *
 * Drawn rather than native. `accent-color` on an `<input type=checkbox>` gets
 * the fill right and nothing else — the box keeps the platform's size, radius
 * and focus ring, so it is the one control on the page that belongs to the
 * operating system instead of to this app. The real input is still there,
 * visually hidden, doing the semantics and the keyboard.
 *
 * The tick draws itself in: `stroke-dashoffset` from the path's own length to
 * zero. It is the one flourish here, and it earns its place by making the state
 * change legible at a glance rather than as a sudden glyph.
 */
export function Checkbox({
  label,
  hint,
  checked,
  indeterminate,
  disabled,
  onChange,
  className,
}: CheckboxProps) {
  const id = useId();
  const on = checked || indeterminate;

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          ref={(el) => {
            // The only way to express the third state: it is a DOM property,
            // not an attribute, so React cannot set it from JSX.
            if (el) el.indeterminate = indeterminate === true && !checked;
          }}
          onChange={(event) => onChange(event.target.checked)}
          className={cn(
            "peer absolute inset-0 cursor-pointer opacity-0",
            disabled && "cursor-not-allowed",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "rounded-inner pointer-events-none flex size-4 items-center justify-center border",
            transitionFast,
            "peer-focus-visible:outline-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
            on ? "bg-accent border-accent" : "border-ink-faint",
            disabled && "opacity-40",
          )}
        >
          {indeterminate && !checked ? (
            <span className="bg-on-accent h-0.5 w-2 rounded-full" />
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2.5 6.2L4.8 8.5L9.5 3.8"
                stroke="var(--on-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={checked ? 0 : 1}
                className="transition-[stroke-dashoffset] duration-(--duration-base) ease-(--ease-out)"
              />
            </svg>
          )}
        </span>
      </span>

      <label htmlFor={id} className={cn("cursor-pointer", disabled && "cursor-not-allowed")}>
        <span className="text-small text-ink-muted">{label}</span>
        {hint ? (
          <span className="text-tiny text-ink-faint mt-0.5 block leading-relaxed">{hint}</span>
        ) : null}
      </label>
    </div>
  );
}
