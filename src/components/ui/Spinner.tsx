import { cn } from "@/lib/cn";

export interface SpinnerProps {
  className?: string;
  /** Accessible description of what is loading. */
  label?: string;
}

/** An indeterminate progress indicator. */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-3.5 shrink-0 animate-spin rounded-full",
        "border-wire border-t-accent border-2",
        className,
      )}
    />
  );
}
