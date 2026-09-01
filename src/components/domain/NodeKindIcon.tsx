import type { NodeKind } from "@/ipc";
import { cn } from "@/lib/cn";

/** How prominent the glyph should be. */
export type NodeKindIconSize = "sm" | "md";

export interface NodeKindIconProps {
  kind: NodeKind;
  size?: NodeKindIconSize;
  /** Marks this as the explorer's own session. */
  local?: boolean;
  /** Marks the node as needing attention, which outranks the local marker. */
  alert?: boolean;
  className?: string;
}

/**
 * Shape and letter per role.
 *
 * Two channels, not one. A router is a rounded square, a peer a circle, a
 * client a dashed circle — so the role survives being scanned at a glance in a
 * dense graph, and survives being printed in greyscale or read by someone who
 * cannot separate the colours.
 */
const ROLE: Record<NodeKind, { letter: string; label: string; shape: string }> = {
  router: { letter: "R", label: "Router", shape: "rounded-inner border-solid" },
  peer: { letter: "P", label: "Peer", shape: "rounded-full border-solid" },
  client: { letter: "C", label: "Client", shape: "rounded-full border-dashed" },
};

const SIZES: Record<NodeKindIconSize, string> = {
  sm: "size-4 text-[0.625rem] border",
  md: "size-[21px] text-tiny border",
};

/**
 * The badge identifying a node's role.
 *
 * Used by the graph node, the side list and the inspector, so the three always
 * agree. A letter rather than an icon: at this size three distinguishable
 * glyphs read faster than three similar pictures, and they can be spoken aloud.
 */
export function NodeKindIcon({ kind, size = "md", local, alert, className }: NodeKindIconProps) {
  const role = ROLE[kind];

  return (
    <span
      title={local ? `${role.label} — this explorer` : role.label}
      aria-label={role.label}
      className={cn(
        "numeric inline-flex shrink-0 items-center justify-center font-medium",
        SIZES[size],
        role.shape,
        alert
          ? "border-warn text-warn"
          : local
            ? "border-ok text-ok"
            : "border-accent/60 text-accent-strong",
        className,
      )}
    >
      {role.letter}
    </span>
  );
}
