import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** Semantic colour, matching the status tokens. */
export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Shows a filled dot before the label — used for liveness. */
  dot?: boolean;
  /** Renders the label in the monospace face, for zids and key expressions. */
  mono?: boolean;
  /** Tooltip. Badges are terse by design, so most need one. */
  title?: string;
  className?: string;
  children: ReactNode;
}

const TONES: Record<BadgeTone, { fill: string; text: string; dot: string }> = {
  neutral: { fill: "bg-surface-3", text: "text-ink-muted", dot: "bg-ink-faint" },
  accent: { fill: "bg-accent-subtle", text: "text-accent-strong", dot: "bg-accent" },
  ok: { fill: "bg-ok-subtle", text: "text-ok", dot: "bg-ok" },
  warn: { fill: "bg-warn-subtle", text: "text-warn", dot: "bg-warn" },
  danger: { fill: "bg-danger-subtle", text: "text-danger", dot: "bg-danger" },
};

export function Badge({ tone = "neutral", dot, mono, title, className, children }: BadgeProps) {
  const palette = TONES[tone];
  return (
    <span
      title={title}
      className={cn(
        // 12px never runs at 400 — see the weight rule in theme.css.
        "rounded-inner text-tiny tracking-ui inline-flex items-center gap-1.5 px-2 py-0.5 font-medium whitespace-nowrap",
        palette.fill,
        palette.text,
        mono && "numeric",
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", palette.dot)} /> : null}
      {children}
    </span>
  );
}
