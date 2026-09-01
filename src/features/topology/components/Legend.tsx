import { NODE_KINDS, NODE_ROLES, NodeKindIcon } from "@/components/domain";
import { cn } from "@/lib/cn";
import { EDGE_KINDS } from "../lib/edgeStyle";

/**
 * What the shapes on the canvas mean, along the bottom of it.
 *
 * On screen permanently rather than behind a chip. The graph encodes four facts
 * in its strokes and three in its glyphs, and a vocabulary that has to be opened
 * to be read is a vocabulary most people will guess at instead.
 *
 * Every swatch renders the REAL thing: the node rows use `NodeKindIcon` and the
 * link rows take their stroke straight out of `edgeStyle`. A legend that
 * restates its subject in its own markup is one that will eventually be wrong
 * about it — this one cannot drift, because there is nothing here to drift from.
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
          <NodeKindIcon kind={kind} size="sm" />
        </Entry>
      ))}

      <Rule />

      <Entry
        label="reported"
        title="Drawn with a dashed edge: only another node told us this one exists"
      >
        <span className="border-ink-faint rounded-inner size-4 shrink-0 border border-dashed" />
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
              strokeWidth={edge.width}
              strokeDasharray={edge.dash}
            />
          </svg>
        </Entry>
      ))}
    </div>
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
