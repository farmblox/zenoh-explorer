import type { ComponentPropsWithRef, ReactNode } from "react";

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
export interface InputProps extends Omit<ComponentPropsWithRef<"input">, "size" | "prefix"> {
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
   * Painted behind the text, aligned to it.
   *
   * For marking part of a value rather than the whole field — the offending
   * chunk of a key expression, say. Wrapped with the input rather than with the
   * whole container so it lines up with the text and not with the prefix, and
   * `pointer-events-none` so it never takes a click meant for the field.
   */
  decoration?: ReactNode;
  /**
   * Rendered above the text, for parts of the value that can be clicked.
   *
   * Separate from `decoration` because the two cannot be one layer: a tint has
   * to sit under the glyphs or it washes them out, and a hit target has to sit
   * over them or the input takes the click first. So the paint goes below and
   * the targets go above, both aligned to the same text.
   *
   * `pointer-events-none` here; children opt in, so the gaps between targets
   * still place a caret in the field.
   */
  overlay?: ReactNode;
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
  decoration,
  overlay,
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
      <span className="relative flex min-w-0 flex-1 items-center">
        {decoration ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {decoration}
          </span>
        ) : null}
        <input
          aria-invalid={invalid || undefined}
          // Every field in this app holds an identifier, an endpoint, a key
          // expression or a config fragment. macOS will happily autocorrect
          // `agv` to `age` and curl the quotes in a JSON5 block, so the OS is
          // told to keep out of all of them. Before the spread, so a caller that
          // genuinely wants a spellchecked field can still ask for one.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            "text-small text-ink relative w-full min-w-0 bg-transparent outline-none",
            "placeholder:text-ink-faint",
            "disabled:text-ink-disabled disabled:cursor-not-allowed",
            mono && "numeric",
            className,
          )}
          {...props}
        />
        {overlay ? (
          <span className="pointer-events-none absolute inset-0 overflow-hidden">{overlay}</span>
        ) : null}
      </span>

      {suffix ? (
        <span className="text-tiny text-ink-faint shrink-0 font-medium">{suffix}</span>
      ) : null}
    </div>
  );
}
