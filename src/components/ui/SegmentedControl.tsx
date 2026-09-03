import { cn } from "@/lib/cn";
import { focusRing, transitionFast } from "@/lib/states";

export interface Segment<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Graph layout". */
  label: string;
  className?: string;
}

/**
 * A small set of mutually exclusive options, shown all at once.
 *
 * Rendered as a radio group rather than buttons so that arrow keys move between
 * options and screen readers announce the selection — which is what this
 * control actually is.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "rounded-control bg-surface-2 border-line inline-flex h-9 items-center gap-0.5 border p-1",
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(segment.value)}
            className={cn(
              "rounded-inner text-small tracking-ui flex h-full items-center justify-center px-3 font-medium whitespace-nowrap",
              focusRing,
              transitionFast,
              selected
                ? "bg-surface-3 text-ink"
                : "text-ink-faint hover:bg-surface-3 hover:text-ink",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
