import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { fieldFocus, fieldInvalid, fieldRest, transitionFast } from "@/lib/states";

/**
 * Field height, matching `Button` step for step.
 *
 * A field and a button sitting in the same toolbar have to be the same height,
 * or the row reads as two rows. `lg` exists for dialog forms, where a field is
 * the subject rather than a control beside other controls.
 */
export type InputSize = "sm" | "md" | "lg";

// `prefix` is a real HTML attribute (a string) and `size` is a number; ours
// take a node and a scale, so both are replaced rather than widened.
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  size?: InputSize;
  /** Static label inside the field, e.g. `key expr`. */
  prefix?: ReactNode;
  /** Status or count shown at the trailing edge. */
  suffix?: ReactNode;
  /** Renders the value in the monospace face. */
  mono?: boolean;
  /** Marks the field invalid and rings it in the danger colour. */
  invalid?: boolean;
  /**
   * Marks this as the field a dialog should focus when it opens.
   *
   * See `Dialog`: `showModal()` picks the first tabbable descendant, and
   * React's `autoFocus` fires while the dialog is still hidden.
   */
  "data-autofocus"?: boolean;
  containerClassName?: string;
}

const SIZES: Record<InputSize, string> = {
  sm: "h-7 px-2.5 gap-2",
  md: "h-8 px-3 gap-2.5",
  lg: "h-[38px] px-3.5 gap-2.5",
};

/**
 * A single-line field.
 *
 * Focus is a ring drawn as a box-shadow rather than a thicker border, so it
 * costs no layout — a border that grows on focus shifts every sibling by a
 * pixel.
 *
 * The wrapper carries the visuals so `prefix` and `suffix` sit inside the same
 * ring as the text instead of looking like separate controls.
 */
export function Input({
  size = "md",
  prefix,
  suffix,
  mono,
  invalid,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const { disabled } = props;

  return (
    <div
      className={cn(
        // Transparent, not filled. A field used to be `surface-2`, which made
        // it invisible the moment it sat on a `surface-2` ground — inside a
        // dialog, inside a popover. Taking the colour of whatever it is on and
        // letting the border define it means one rule works everywhere, and it
        // is the reason the dialog could move up to the raised surface at all.
        "rounded-control flex items-center border bg-transparent",
        SIZES[size],
        transitionFast,
        // A halo drawn as a shadow, so focus never shifts a neighbour by the
        // pixel a thicker border would add.
        fieldRest,
        // A disabled field has to LOOK disabled. The keyspace toolbar locks the
        // key expression while a subscription is running, and a field that
        // still reads as editable there is the app lying about its own state.
        disabled ? "bg-fill text-ink-disabled" : invalid ? fieldInvalid : fieldFocus,
        containerClassName,
      )}
    >
      {prefix ? (
        <span
          className={cn(
            "text-tiny shrink-0 font-medium",
            disabled ? "text-ink-disabled" : "text-ink-faint",
          )}
        >
          {prefix}
        </span>
      ) : null}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          "text-small text-ink min-w-0 flex-1 bg-transparent outline-none",
          "placeholder:text-ink-faint",
          "disabled:text-ink-disabled disabled:cursor-not-allowed",
          mono && "numeric",
          className,
        )}
        {...props}
      />
      {suffix ? (
        <span className="text-tiny text-ink-faint shrink-0 font-medium">{suffix}</span>
      ) : null}
    </div>
  );
}
