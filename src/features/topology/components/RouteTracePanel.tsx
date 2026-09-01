import { X } from "lucide-react";

import { NodeKindIcon } from "@/components/domain";
import { Badge, Button, Meter, ResizablePanel, ScrollArea } from "@/components/ui";
import type { TopologySnapshot } from "@/ipc";
import { cn } from "@/lib/cn";
import { label } from "../lib/grouping";
import { describeRoute, routeTitle, traceToLocal } from "../lib/route";

export interface RouteTracePanelProps {
  /** Zid the route starts from. */
  from: string;
  snapshot: TopologySnapshot;
  onClose: () => void;
}

/**
 * How data from one node reaches this explorer.
 *
 * A hop chain rather than a highlighted path on the canvas: the canvas already
 * shows you the shape of the network, and what you want here is the sequence —
 * which node, over what, in what order. Reading a sequence off a graph means
 * tracing it with your eyes, which is exactly the work this saves.
 */
export function RouteTracePanel({ from, snapshot, onClose }: RouteTracePanelProps) {
  const route = traceToLocal(snapshot, from);

  return (
    <ResizablePanel
      id="topology-route-trace"
      side="right"
      defaultWidth={364}
      minWidth={300}
      maxWidth={560}
      label="Resize the route trace"
      className="border-line bg-surface-0 border-l"
    >
      <header className="border-line shrink-0 border-b px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-small text-ink font-medium">Route trace</h2>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close route trace">
            <X size={14} />
          </Button>
        </div>

        <p className="text-small text-ink mt-2.5 truncate">{routeTitle(route)}</p>

        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="numeric text-tiny text-ink font-medium">{describeRoute(route)}</span>
          {route.warnings > 0 ? (
            <>
              <span className="bg-line h-3 w-px" aria-hidden />
              <span className="text-tiny text-warn">
                {route.warnings} link{route.warnings === 1 ? "" : "s"} confirmed by one end only
              </span>
            </>
          ) : null}
        </div>
      </header>

      <ScrollArea className="flex-1">
        {route.unreachable ? (
          <p className="text-tiny text-ink-faint px-4 py-4 leading-relaxed">
            Nothing links this node back to the explorer in the current snapshot. Either the path
            runs through a node whose admin space is switched off, or the node was discovered by a
            scout reply and holds no session we can see.
          </p>
        ) : (
          <ol className="py-1.5">
            {route.hops.map((hop, index) => {
              const first = index === 0;
              const last = index === route.hops.length - 1;

              return (
                <li key={hop.node.zid}>
                  <div
                    className={cn(
                      "flex h-10 items-center gap-3 px-4",
                      hop.unconfirmed && "bg-warn-subtle/40",
                    )}
                  >
                    <NodeKindIcon
                      kind={hop.node.kind}
                      size="sm"
                      local={hop.node.isLocal}
                      alert={hop.unconfirmed}
                    />
                    <span className="text-small text-ink max-w-[128px] truncate">
                      {label(hop.node)}
                    </span>

                    {/* Position along the chain, as a share. With no per-hop
                        latency in the snapshot, distance travelled is the only
                        honest thing this bar can mean. */}
                    <Meter
                      value={route.hops.length > 1 ? index / (route.hops.length - 1) : 1}
                      size="md"
                      tone={hop.unconfirmed ? "warn" : "neutral"}
                      label={`Hop ${index + 1} of ${route.hops.length}`}
                      className="min-w-0 flex-1"
                    />

                    <span className="numeric text-tiny text-ink-faint w-12 shrink-0 text-right">
                      {first ? "source" : last ? "here" : `hop ${index}`}
                    </span>
                  </div>

                  <div className="text-tiny text-ink-faint flex items-center gap-2 px-4 pb-2.5 pl-11">
                    {hop.protocol ? <Badge mono>{hop.protocol}</Badge> : null}
                    {hop.unconfirmed ? (
                      <span className="text-warn">only one end reported this link</span>
                    ) : first ? (
                      <span>where the trace starts</span>
                    ) : (
                      <span className="numeric truncate">{hop.node.zid.slice(0, 16)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ScrollArea>
    </ResizablePanel>
  );
}
