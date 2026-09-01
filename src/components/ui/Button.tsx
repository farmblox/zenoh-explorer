import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { controlBase, disabledState, overlayStates, pressMotion } from "@/lib/states";

/**
 * Visual weight, in descending order of how much attention it demands.
 * There is exactly one `primary` button on screen at a time.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
  hint,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
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
      {icon}
      {children}
      {hint ? <span className="numeric text-ink-faint text-tiny ml-1">{hint}</span> : null}
    </button>
  );
}
