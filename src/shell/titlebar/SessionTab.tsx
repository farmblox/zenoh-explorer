import { X } from "lucide-react";
import type { ReactNode } from "react";

import { StatusDot, type Status } from "@/components/ui";
import { cn } from "@/lib/cn";
import { focusRingOnChrome, transitionFast } from "@/lib/states";

/** What the connection behind a tab is doing. */
export type SessionTabState = "live" | "degraded" | "connecting" | "failed";

const DOTS: Record<SessionTabState, { status: Status; pulse: boolean }> = {
  live: { status: "live", pulse: false },
  degraded: { status: "degraded", pulse: false },
  connecting: { status: "connecting", pulse: true },
  failed: { status: "down", pulse: false },
};

export interface SessionTabProps {
  /** What the session or attempt is called. */
  label: string;
  /** What its connection is doing. Shown by the dot. */
  state: SessionTabState;
  /** Whether this is the tab currently on screen. Shown by the fill. */
  selected?: boolean;
  /** Right-aligned value at rest — a transport count. */
  meta?: ReactNode;
  title?: string | undefined;
  onSelect?: (() => void) | undefined;
  onClose: () => void;
  closeLabel: string;
}

/**
 * One tab in the session strip.
 *
 * Selection is a FILL and nothing else — the same `surface-2` the sidebar uses
 * for the view you are on. Nothing in this app outlines the selected thing, so
 * a tab that did read as a different kind of control that had wandered into the
 * title bar.
 *
 * That leaves the dot free to carry the only other thing a tab has to say:
 * whether its connection is up, still being made, or broken. Two questions, two
 * channels, neither borrowing the other's.
 *
 * The trailing slot holds the meta at rest and the close button on hover or
 * focus — one slot rather than two, so revealing the close never nudges the
 * label, and sized from the meta rather than the button. Every tab can be
 * closed, including one still connecting, which is when you most want to.
 */
export function SessionTab({
  label,
  state,
  selected = false,
  meta,
  title,
  onSelect,
  onClose,
  closeLabel,
}: SessionTabProps) {
  const dot = DOTS[state];
  const failed = state === "failed";

  return (
    <div
      title={title}
      className={cn(
        "group rounded-control relative flex h-8 shrink-0 items-center gap-2 pr-1.5 pl-3",
        transitionFast,
        // Three levels against the title bar's own surface-0: an unselected tab
        // still has a fill, so it reads as a tab rather than as bare chrome,
        // and the selected one wins clearly. Exactly one tab is ever selected,
        // because only an open session can be — an attempt has no view behind
        // it to show.
        failed
          ? "bg-danger-subtle"
          : selected
            ? "bg-surface-2"
            : "bg-surface-1 hover:bg-surface-2/70",
      )}
    >
      <StatusDot status={dot.status} pulse={dot.pulse} />

      <button
        type="button"
        onClick={onSelect}
        disabled={onSelect === undefined}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "text-small rounded-inner max-w-40 truncate text-left disabled:cursor-default",
          focusRingOnChrome,
          transitionFast,
          failed ? "text-danger" : selected ? "text-ink" : "text-ink-muted group-hover:text-ink",
        )}
      >
        {label}
      </button>

      <span className="relative flex h-4 min-w-4 shrink-0 items-center justify-end">
        {meta !== undefined && meta !== null ? (
          <span
            aria-hidden
            className={cn(
              "numeric text-tiny text-ink-faint px-0.5",
              "transition-opacity duration-(--duration-fast)",
              "group-focus-within:opacity-0 group-hover:opacity-0",
            )}
          >
            {meta}
          </span>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className={cn(
            "rounded-inner absolute inset-y-0 right-0 flex w-4 items-center justify-center",
            "text-ink-faint hover:text-ink",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "transition-opacity duration-(--duration-fast)",
            focusRingOnChrome,
          )}
        >
          <X size={11} />
        </button>
      </span>
    </div>
  );
}
