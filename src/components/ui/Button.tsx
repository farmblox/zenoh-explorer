import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";
import { controlBase, disabledState, overlayStates, pressMotion } from "@/lib/states";

/**
 * Visual weight, in descending order of how much attention it demands.
 * There is exactly one `primary` button on screen at a time.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/**
 * Marks the action as running.
 *
 * The button keeps its label and its width — swapping the text for a spinner
 * makes the row jump and loses the one word that says what you are waiting
 * for. The icon slot carries the spinner instead, and the button stops
 * accepting clicks, because Connect taking four seconds is exactly when
 * someone presses it again.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Runs the action's spinner and blocks further presses. */
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before the label, sized to match. */
  icon?: ReactNode;
  /** Keyboard hint shown right-aligned, e.g. `⌘K`. */
  hint?: string;
}

/**
 * Flat fills, no outline and no shadow.
 *
 * Hover and press come from `overlayStates` — a translucent white (or black in
 * the light theme) laid over whatever fill the variant already has. One rule
 * covers every variant, and it lands correctly on all four surfaces without
 * anybody hand-picking a hover colour.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent",
  secondary: "bg-surface-2 text-ink",
  ghost: "text-ink-muted hover:text-ink",
  danger: "bg-danger-subtle text-danger hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-tiny gap-1.5",
  md: "h-8 px-3 text-small gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  hint,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || loading === true}
      aria-busy={loading === true || undefined}
      className={cn(
        "rounded-control inline-flex shrink-0 items-center justify-center",
        "font-medium whitespace-nowrap",
        controlBase,
        overlayStates,
        pressMotion,
        disabledState,
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {/* The spinner takes the icon's slot rather than replacing the label,
          so the button keeps its width and the word that says what is running.
          A button with no icon still reserves the space while busy, for the
          same reason. */}
      {loading ? <Spinner /> : icon}
      {children}
      {hint ? <span className="numeric text-ink-faint text-tiny ml-1">{hint}</span> : null}
    </button>
  );
}
