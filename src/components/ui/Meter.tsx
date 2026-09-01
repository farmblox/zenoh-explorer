import { cn } from "@/lib/cn";

/**
 * Bar heights, in the four sizes the interface actually uses.
 *
 * A fixed scale rather than a free number: a share bar on a node card and a
 * congestion bar in a table are the same object at different densities, and
 * they should look it.
 */
export type MeterSize = "xs" | "sm" | "md" | "lg";

/** Semantic colour for the filled portion. */
export type MeterTone = "accent" | "ok" | "warn" | "danger" | "neutral";

const SIZES: Record<MeterSize, string> = {
  xs: "h-[3px]",
  sm: "h-1",
  md: "h-[5px]",
  lg: "h-1.5",
};

const TONES: Record<MeterTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  neutral: "bg-track",
};

export interface MeterProps {
  /** Filled fraction, 0 to 1. Clamped. */
  value: number;
  size?: MeterSize;
  tone?: MeterTone;
  /** Accessible description, e.g. "Share of region traffic". */
  label: string;
  className?: string;
}

/**
 * How much of something, against its whole.
 *
 * This shape recurs everywhere in the app — traffic share on a node, latency
 * share on a route hop, congestion on a link, depth of a priority queue. One
 * component for all of them is most of what makes those screens feel like parts
 * of the same instrument rather than four separate tables.
 */
export function Meter({ value, size = "md", tone = "accent", label, className }: MeterProps) {
  const fraction = Math.max(0, Math.min(1, value));

  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "bg-line-soft block w-full overflow-hidden rounded-full",
        SIZES[size],
        className,
      )}
    >
      <span
        className={cn(
          "block h-full rounded-full",
          TONES[tone],
          "transition-[width] duration-(--duration-base) ease-(--ease-out)",
        )}
        style={{ width: `${fraction * 100}%` }}
      />
    </span>
  );
}

export interface MixSegment {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly tone: MeterTone;
}

export interface MixProps {
  segments: readonly MixSegment[];
  size?: MeterSize;
  /** Draws a key beneath, naming each segment with its count. */
  legend?: boolean;
  className?: string;
}

/**
 * What something is made of, as proportions of one bar.
 *
 * The same geometry as `Meter`, reading a different question: not "how far
 * along" but "in what proportion". Segments are separated by a real gap so the
 * boundaries survive at four pixels tall.
 */
export function Mix({ segments, size = "sm", legend, className }: MixProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const present = segments.filter((segment) => segment.value > 0);

  return (
    <div className={className}>
      <div className={cn("flex gap-0.5", SIZES[size])}>
        {present.map((segment) => (
          <span
            key={segment.key}
            title={`${segment.label} ${segment.value}`}
            className={cn("h-full rounded-full", TONES[segment.tone])}
            // A floor, so a single client in a thousand-node region is still a
            // visible sliver rather than nothing.
            style={{ width: `${Math.max(2, (segment.value / total) * 100)}%` }}
          />
        ))}
      </div>

      {legend ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {present.map((segment) => (
            <span
              key={segment.key}
              className="text-tiny text-ink-faint flex items-center gap-1.5 font-medium whitespace-nowrap"
            >
              <span className={cn("size-[7px] shrink-0 rounded-[2px]", TONES[segment.tone])} />
              {segment.label} {segment.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
