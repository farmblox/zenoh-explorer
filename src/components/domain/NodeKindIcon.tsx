import type { NodeKind } from "@/ipc";
import { cn } from "@/lib/cn";
import { NODE_ROLES } from "./nodeRoles";

/** How prominent the glyph should be. */
export type NodeKindIconSize = "sm" | "md";

export interface NodeKindIconProps {
  kind: NodeKind;
  size?: NodeKindIconSize;
  /** Marks this as the explorer's own session. */
  local?: boolean;
  /** Marks the node as needing attention, which outranks everything else. */
  alert?: boolean;
  /** Lifts the glyph to the accent colour, for the node currently picked. */
  selected?: boolean;
  className?: string;
}

const SIZES: Record<NodeKindIconSize, string> = {
  sm: "size-4 text-micro border",
  md: "size-[18px] text-micro border",
};

/**
 * The badge identifying a node's role.
 *
 * Used by the graph node, the side list, the inspector and the legend, so all
 * four always agree — the shapes come from `nodeRoles`, not from here.
 *
 * A letter rather than an icon: at this size three distinguishable glyphs read
 * faster than three similar pictures, and they can be spoken aloud.
 */
export function NodeKindIcon({
  kind,
  size = "md",
  local,
  alert,
  selected,
  className,
}: NodeKindIconProps) {
  const role = NODE_ROLES[kind];

  return (
    <span
      title={local ? `${role.label} — this explorer` : role.label}
      aria-label={role.label}
      className={cn(
        "numeric inline-flex shrink-0 items-center justify-center font-medium",
        SIZES[size],
        role.shape,
        // Quiet at rest. A graph where every glyph is accent-coloured has
        // nothing left to say when one of them matters.
        alert
          ? "border-warn text-warn"
          : selected
            ? "border-accent bg-accent-subtle text-accent"
            : local
              ? "border-ok text-ok"
              : "border-ink-faint text-ink-faint",
        className,
      )}
    >
      {role.letter}
    </span>
  );
}
