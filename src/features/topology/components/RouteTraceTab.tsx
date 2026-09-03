import { useEffect, useMemo } from "react";
import { AlertTriangle, Route } from "lucide-react";

import { NodeKindIcon } from "@/components/domain";
import { Badge, Button, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks";
import {
  topology as topologyIpc,
  type SessionId,
  type TopologySnapshot,
  type TraceStop,
} from "@/ipc";
import { cn } from "@/lib/cn";
import { label } from "../lib/grouping";
import {
  localRouterTrace,
  planRouteToLocal,
  resolveRoute,
  type ResolvedRoute,
  type RouteSegment,
} from "../lib/routePlan";

export interface RouteTraceTabProps {
  sessionId: SessionId;
  from: string;
  snapshot: TopologySnapshot;
  onPathChange: (zids: readonly string[]) => void;
}

/** The route tab inside a node inspector, backed by Zenoh's successor table. */
export function RouteTraceTab({ sessionId, from, snapshot, onPathChange }: RouteTraceTabProps) {
  const planned = useMemo(() => planRouteToLocal(snapshot, from), [snapshot, from]);
  const plan = planned.plan;
  const queryKey = plan
    ? `${sessionId}:${plan.sourceRouter.zid}:${plan.targetRouter.zid}`
    : `${sessionId}:unavailable:${from}`;

  const {
    data: trace,
    loading,
    error,
    reload,
  } = useAsync(
    () => {
      if (!plan) throw new Error("Route has no router endpoints");
      return plan.sourceRouter.zid === plan.targetRouter.zid
        ? Promise.resolve(localRouterTrace(plan))
        : topologyIpc.routeTrace(sessionId, plan.sourceRouter.zid, plan.targetRouter.zid);
    },
    queryKey,
    { enabled: plan !== null },
  );

  const route = useMemo(
    () => (plan && trace ? resolveRoute(snapshot, plan, trace) : null),
    [snapshot, plan, trace],
  );

  useEffect(() => {
    onPathChange(route?.zids ?? []);
    return () => onPathChange([]);
  }, [route, onPathChange]);

  const nodes = useMemo(() => new Map(snapshot.nodes.map((node) => [node.zid, node])), [snapshot]);

  return (
    <div className="p-4">
      {plan ? (
        <div className="border-line-soft bg-surface-1 rounded-panel border px-3 py-3">
          <div className="flex items-center gap-2">
            <Route size={14} className="text-accent" />
            <span className="text-small text-ink font-semibold">Chosen by Zenoh</span>
            <Badge tone="accent" className="ml-auto">
              queried now
            </Badge>
          </div>
          <p className="text-tiny text-ink-faint mt-2 leading-relaxed">
            Router decisions from <span className="text-ink">{label(plan.sourceRouter)}</span> to{" "}
            <span className="text-ink">{label(plan.targetRouter)}</span>
          </p>
        </div>
      ) : null}

      {!plan ? (
        <RouteMessage tone="warn">{planned.reason}</RouteMessage>
      ) : loading ? (
        <RouteMessage>
          <Spinner /> Asking every router for its next-hop decision…
        </RouteMessage>
      ) : error ? (
        <RouteMessage tone="warn">
          <span>{error}</span>
          <Button size="sm" onClick={reload}>
            Retry
          </Button>
        </RouteMessage>
      ) : route ? (
        <RouteSequence route={route} nodes={nodes} />
      ) : null}
    </div>
  );
}

function RouteSequence({
  route,
  nodes,
}: {
  route: ResolvedRoute;
  nodes: ReadonlyMap<string, TopologySnapshot["nodes"][number]>;
}) {
  return (
    <>
      <div className="border-line-soft mt-3 flex items-center gap-2 border-y px-1 py-2.5">
        <span className={cn("size-2 rounded-full", route.arrived ? "bg-accent" : "bg-warn")} />
        <span className="text-small text-ink font-medium">
          {route.arrived ? routeSummary(route) : stoppedLabel(route.stopped)}
        </span>
        <span className="numeric text-tiny text-ink-faint ml-auto">{route.zids.length} nodes</span>
      </div>

      <ol className="relative mt-1">
        <span className="bg-line absolute top-5 bottom-5 left-[17px] w-px" aria-hidden />
        {route.zids.map((zid, index) => {
          const node = nodes.get(zid);
          const incoming = index > 0 ? route.segments[index - 1] : undefined;
          const last = index === route.zids.length - 1;

          return (
            <li key={`${zid}:${index}`} className="relative flex min-h-14 items-start gap-3 py-2">
              <span className="bg-surface-0 relative z-10 flex size-9 shrink-0 items-center justify-center">
                {node ? (
                  <NodeKindIcon kind={node.kind} size="sm" local={node.isLocal} />
                ) : (
                  <span className="border-line text-tiny text-ink-faint flex size-5 items-center justify-center rounded-full border">
                    ?
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-small text-ink truncate font-medium">
                    {node ? label(node) : `${zid.slice(0, 12)}…`}
                  </span>
                  <span className="text-micro text-ink-faint shrink-0 font-semibold tracking-wide uppercase">
                    {index === 0 ? "source" : last ? "here" : `hop ${index}`}
                  </span>
                </div>
                <p className="text-tiny text-ink-faint mt-1 truncate">
                  {incoming ? segmentLabel(incoming) : "where the trace starts"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function RouteMessage({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "text-small mt-4 flex items-start gap-2.5 leading-relaxed",
        tone === "warn" ? "text-warn" : "text-ink-muted",
      )}
    >
      {tone === "warn" ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : null}
      {children}
    </div>
  );
}

function routeSummary(route: ResolvedRoute): string {
  if (route.routerHops === 0) return "Same router — direct access path";
  return `${route.routerHops} router ${route.routerHops === 1 ? "decision" : "decisions"}`;
}

function stoppedLabel(stopped: TraceStop | null): string {
  switch (stopped) {
    case "loop":
      return "Routing loop reported";
    case "tooLong":
      return "Route exceeded the hop limit";
    case "noSuccessor":
    default:
      return "No complete route was reported";
  }
}

function segmentLabel(segment: RouteSegment): string {
  const link = segment.link;
  if (!link) return "next-hop decision · edge absent from this snapshot";
  if (link.inRoutingMap) {
    const region = link.region ?? "routing region";
    const cost = link.routingCost === null ? "" : ` · cost ${formatCost(link.routingCost)}`;
    return `${region}${cost}`;
  }
  return `${link.protocol ?? "session"} · access`;
}

function formatCost(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
