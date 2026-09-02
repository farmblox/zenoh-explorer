import { NODE_ROLES } from "@/components/domain";
import type { NodeKind } from "@/ipc";
import { cn } from "@/lib/cn";

export interface TopologyNodeIconProps {
  kind: NodeKind;
  local?: boolean;
  alert?: boolean;
  selected?: boolean;
  context?: boolean;
}

/** The WebGL beacon rendered as DOM, with its role letter retained for lists. */
export function TopologyNodeIcon({ kind, local, alert, selected, context }: TopologyNodeIconProps) {
  const role = NODE_ROLES[kind];

  return (
    <span
      title={local ? `${role.label} — this explorer` : role.label}
      aria-label={role.label}
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border",
        "numeric text-micro font-[760]",
        context && !selected && "opacity-55",
        alert
          ? "border-warn text-warn"
          : selected
            ? "border-accent text-accent"
            : local
              ? "border-ok text-ok"
              : "border-ink-disabled text-ink-muted",
        selected && "shadow-[0_0_0_3px_var(--accent-subtle)]",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          kind === "router" && "bg-surface-3 size-3.5",
          kind === "peer" && "bg-surface-2 size-3",
          kind === "client" && "bg-ink-disabled/80 text-surface-0 size-2.5",
        )}
      >
        {role.letter}
      </span>
    </span>
  );
}
