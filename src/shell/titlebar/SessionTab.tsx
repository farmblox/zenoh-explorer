import { X } from "lucide-react";
import type { ReactNode } from "react";

import { StatusDot, type Status } from "@/components/ui";
import { cn } from "@/lib/cn";
import { focusRingOnChrome, transitionFast } from "@/lib/states";

export interface SessionTabProps {
  /** What the session or attempt is called. */
  label: string;
  status: Status;
  /** Draws the dot breathing, for a connection still being made. */
  pulse?: boolean;
  /** Right-aligned value at rest — a transport count, or a word like "failed". */
  meta?: ReactNode;
  active?: boolean;
  /** Tints the whole tab, for an attempt that failed. */
  tone?: "default" | "danger";
  title?: string | undefined;
  onSelect?: (() => void) | undefined;
  onClose: () => void;
  closeLabel: string;
}

/**
 * One tab in the session strip.
 *
 * A tab, not a pill: fully rounded reads as a chip, something you dismiss,
 * where these are places you go. The softened rectangle and the extra height
 * give them the weight of a destination, and let the active one sit as a raised
 * surface rather than a tinted lozenge.
 *
 * The trailing slot holds the meta at rest and the close button on hover or
 * focus — one fixed-width slot rather than two, so revealing the close button
 * never nudges the label. That also means every tab can be closed, including
 * one still connecting, which is exactly when you most want to give up on it.
 */
export function SessionTab({
  label,
  status,
  pulse,
  meta,
  active,
  tone = "default",
  title,
  onSelect,
  onClose,
  closeLabel,
}: SessionTabProps) {
  return (
    <div
      title={title}
      className={cn(
        "group rounded-control relative flex h-8 shrink-0 items-center gap-2 border pr-1.5 pl-3",
        transitionFast,
        tone === "danger"
          ? "bg-danger-subtle border-danger/30"
          : active
            ? "bg-surface-2 border-line shadow-[0_1px_0_var(--line-soft)]"
            : "hover:bg-surface-2/70 border-transparent",
      )}
    >
      <StatusDot status={status} pulse={pulse} />

      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-small rounded-inner max-w-40 truncate text-left",
          focusRingOnChrome,
          transitionFast,
          "disabled:cursor-default",
          tone === "danger"
            ? "text-danger"
            : active
              ? "text-ink"
              : "text-ink-muted group-hover:text-ink",
        )}
      >
        {label}
      </button>

      {/* One slot, two occupants, only ever one of them visible — so revealing
          the close button never nudges the label. The slot takes its width from
          the meta rather than being fixed at the close button's 16px, which is
          what let a wider value spill over the tab's edge. */}
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
