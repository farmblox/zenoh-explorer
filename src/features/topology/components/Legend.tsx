import { NODE_KINDS, NODE_ROLES } from "@/components/domain";
import type { NodeKind } from "@/ipc";
import { cn } from "@/lib/cn";
import { EDGE_KINDS } from "../lib/edgeStyle";

/**
 * What the shapes on the canvas mean, along the bottom of it.
 *
 * On screen permanently rather than behind a chip. The graph encodes four facts
 * in its strokes and three in its glyphs, and a vocabulary that has to be opened
 * to be read is a vocabulary most people will guess at instead.
 *
 * Every swatch renders the real WebGL vocabulary: layered role beacons and link
 * strokes straight out of `edgeStyle`.
 *
 * It scrolls rather than wraps. A second row would change the canvas's height,
 * and the graph would reframe itself because the legend got longer.
 */
export function Legend({ className }: { className?: string }) {
  return (
    <div
      aria-label="What the graph symbols mean"
      className={cn("scroll-none flex min-w-0 items-center gap-4 overflow-x-auto", className)}
    >
      {NODE_KINDS.map((kind) => (
        <Entry key={kind} label={NODE_ROLES[kind].label.toLowerCase()}>
          <GraphNodeSwatch kind={kind} />
        </Entry>
      ))}

      <Rule />

      <Entry label="reported" title="Dimmed: only another node told us this one exists">
        <span className="border-ink-disabled bg-surface-1 size-3.5 shrink-0 rounded-full border opacity-60" />
      </Entry>

      <Rule />

      {EDGE_KINDS.map((edge) => (
        <Entry key={edge.kind} label={edge.label} title={edge.description}>
          <svg width={20} height={10} className="shrink-0" aria-hidden>
            <line
              x1={0}
              y1={5}
              x2={20}
              y2={5}
              stroke={edge.stroke}
              strokeOpacity={edge.opacity}
              strokeWidth={edge.width}
            />
          </svg>
        </Entry>
      ))}

      <Entry label="chosen route" title="The route Zenoh reports for the selected node">
        <svg width={20} height={10} className="shrink-0" aria-hidden>
          <line
            x1={0}
            y1={5}
            x2={20}
            y2={5}
            stroke="var(--accent-strong)"
            strokeWidth={5.5}
            strokeLinecap="round"
          />
        </svg>
      </Entry>
    </div>
  );
}

/** The actual WebGL role glyphs: layered router, ring peer, compact client. */
function GraphNodeSwatch({ kind }: { kind: NodeKind }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
        kind === "router" && "border-ink-disabled border",
      )}
      aria-hidden
    >
      <span
        className={cn(
          "inline-block rounded-full",
          kind === "router" && "bg-surface-3 size-2.5",
          kind === "peer" && "border-ink-disabled bg-surface-2 size-3.5 border-2",
          kind === "client" && "border-surface-1 bg-ink-disabled size-2.5 border",
        )}
      />
    </span>
  );
}

function Entry({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="text-tiny text-ink-faint flex shrink-0 items-center gap-2 whitespace-nowrap"
      {...(title ? { title } : {})}
    >
      {children}
      {label}
    </span>
  );
}

function Rule() {
  return <span className="bg-line h-3.5 w-px shrink-0" aria-hidden />;
}
