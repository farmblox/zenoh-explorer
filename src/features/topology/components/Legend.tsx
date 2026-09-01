import { NODE_KINDS, NODE_ROLES, NodeKindIcon } from "@/components/domain";
import { Popover, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { controlBase, overlayStates } from "@/lib/states";
import { EDGE_KINDS } from "../lib/edgeStyle";

/**
 * What the shapes on the canvas mean, behind a chip.
 *
 * The node rows render the REAL `NodeKindIcon` and the link rows read their
 * stroke straight out of `edgeStyle`. A legend that restates its subject in
 * its own markup is a legend that will eventually be wrong about it — this one
 * cannot drift, because there is nothing here to drift from.
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
      className="w-[232px] p-4"
    >
      <SectionLabel className="mb-2.5">Nodes</SectionLabel>
      <ul className="space-y-2">
        {NODE_KINDS.map((kind) => (
          <li key={kind} className="text-tiny text-ink-muted flex items-center gap-2.5">
            <NodeKindIcon kind={kind} size="sm" />
            {NODE_ROLES[kind].label}
          </li>
        ))}
      </ul>

      <SectionLabel className="mt-4 mb-2.5">Confidence</SectionLabel>
      <ul className="space-y-2">
        <li className="text-tiny text-ink-muted flex items-center gap-2.5">
          <span className="border-line rounded-inner h-4 w-4 shrink-0 border border-solid" />
          Described itself, or we hold a session to it
        </li>
        <li className="text-tiny text-ink-muted flex items-center gap-2.5">
          <span className="border-line rounded-inner h-4 w-4 shrink-0 border border-dashed" />
          Only reported by another node
        </li>
      </ul>

      <SectionLabel className="mt-4 mb-2.5">Links</SectionLabel>
      <ul className="space-y-2">
        {EDGE_KINDS.map((edge) => (
          <li key={edge.kind} className="text-tiny text-ink-muted flex items-center gap-2.5">
            {/* Same width as the node glyph above, so both columns of labels
                start at the same x. */}
            <svg width={16} height={16} className="shrink-0" aria-hidden>
              <line
                x1={0}
                y1={8}
                x2={16}
                y2={8}
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
