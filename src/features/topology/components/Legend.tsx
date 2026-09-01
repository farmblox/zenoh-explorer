import { Popover, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { controlBase, overlayStates } from "@/lib/states";
import { EDGE_KINDS } from "../lib/edgeStyle";

/** Role glyphs, matching `NodeKindIcon` exactly. */
const ROLES = [
  { letter: "R", label: "Router", shape: "rounded-[3px] border-solid" },
  { letter: "P", label: "Peer", shape: "rounded-full border-solid" },
  { letter: "C", label: "Client", shape: "rounded-full border-dashed" },
] as const;

/**
 * What the shapes on the canvas mean, behind a chip.
 *
 * Behind a chip rather than always on screen because a legend is something you
 * need once and then never again. Permanently displaying it would spend canvas
 * on a question most sessions never ask.
 */
export function Legend({ className }: { className?: string }) {
  return (
    <Popover
      label="What the graph symbols mean"
      side="top"
      align="start"
      triggerClassName={cn(
        "rounded-control border-line bg-surface-2 flex h-[30px] items-center gap-2 px-3",
        "text-tiny text-ink-muted hover:text-ink font-medium",
        controlBase,
        overlayStates,
        className,
      )}
      trigger={
        <>
          <span className="numeric text-micro flex size-[13px] items-center justify-center rounded-full border font-medium">
            ?
          </span>
          Legend
        </>
      }
      className="w-[228px] p-4"
    >
      <SectionLabel className="mb-2.5">Nodes</SectionLabel>
      <ul className="space-y-2">
        {ROLES.map((role) => (
          <li key={role.letter} className="text-tiny text-ink-muted flex items-center gap-2.5">
            <span
              className={cn(
                "numeric text-micro border-ink-faint text-ink-faint flex size-4 shrink-0 items-center justify-center border font-medium",
                role.shape,
              )}
            >
              {role.letter}
            </span>
            {role.label}
          </li>
        ))}
      </ul>

      <SectionLabel className="mt-4 mb-2.5">Links</SectionLabel>
      <ul className="space-y-2">
        {EDGE_KINDS.map((edge) => (
          <li key={edge.kind} className="text-tiny text-ink-muted flex items-center gap-2.5">
            <svg width={16} height={12} className="shrink-0" aria-hidden>
              <line
                x1={0}
                y1={6}
                x2={16}
                y2={6}
                stroke={edge.stroke}
                strokeWidth={edge.width}
                strokeDasharray={edge.dash}
                opacity={edge.opacity}
              />
            </svg>
            {edge.description}
          </li>
        ))}
      </ul>
    </Popover>
  );
}
