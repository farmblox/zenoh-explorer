import { cn } from "@/lib/cn";

/** Connection health, in the order a session degrades. */
export type Status = "live" | "connecting" | "degraded" | "down" | "idle";

export interface StatusDotProps {
  status: Status;
  /** Adds a slow, continuous pulse. Reserved for genuinely live state. */
  pulse?: boolean | undefined;
  /**
   * Draws a ring that expands once and fades.
   *
   * Change the `key` on the dot to fire it again — a one-shot CSS animation
   * restarts on mount, which means no timer and no state to hold "am I
   * currently animating".
   */
  ping?: boolean | undefined;
  className?: string | undefined;
}

const COLORS: Record<Status, string> = {
  live: "bg-ok",
  connecting: "bg-accent",
  degraded: "bg-warn",
  down: "bg-danger",
  idle: "bg-ink-faint",
};

const LABELS: Record<Status, string> = {
  live: "Live",
  connecting: "Connecting",
  degraded: "Degraded",
  down: "Disconnected",
  idle: "Idle",
};

/** The small coloured dot used in tabs, the status bar and node headers. */
export function StatusDot({ status, pulse, ping, className }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={LABELS[status]}
      className={cn(
        "relative inline-block size-1.5 shrink-0 rounded-full",
        COLORS[status],
        pulse && "animate-pulse",
        className,
      )}
    >
      {ping ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full motion-safe:animate-[ping-once_1.1s_var(--ease-out)_forwards]",
            COLORS[status],
          )}
        />
      ) : null}
    </span>
  );
}
