import type { LinkSummary, NodeSummary, TopologySnapshot, Trace, TraceStop } from "@/ipc";

export interface RoutePlan {
  /** Node the operator asked about. */
  readonly origin: NodeSummary;
  /** Router where that node enters the routed network. */
  readonly sourceRouter: NodeSummary;
  /** Router carrying the explorer's direct session. */
  readonly targetRouter: NodeSummary;
  /** The explorer's local Zenoh session. */
  readonly destination: NodeSummary;
}

export type RoutePlanResult =
  | { readonly plan: RoutePlan; readonly reason: null }
  | { readonly plan: null; readonly reason: string };

export interface RouteSegment {
  readonly from: string;
  readonly to: string;
  readonly link: LinkSummary | null;
}

export interface ResolvedRoute {
  readonly zids: readonly string[];
  readonly segments: readonly RouteSegment[];
  readonly arrived: boolean;
  readonly stopped: TraceStop | null;
  readonly routerHops: number;
}

/**
 * Finds the unambiguous router endpoints for a route to this explorer.
 *
 * A router is its own endpoint. A peer or client needs exactly one attached
 * router: silently choosing among several would turn a possible path into a
 * claim about the path Zenoh actually selected.
 */
export function planRouteToLocal(snapshot: TopologySnapshot, originZid: string): RoutePlanResult {
  const byZid = new Map(snapshot.nodes.map((node) => [node.zid, node]));
  const origin = byZid.get(originZid);
  const destination = byZid.get(snapshot.localZid);
  if (!origin) return { plan: null, reason: "The source node is no longer in this snapshot." };
  if (!destination) {
    return { plan: null, reason: "The explorer's local session is not in this snapshot." };
  }

  const source = routerEndpoint(origin, snapshot, byZid);
  if (source.reason) return { plan: null, reason: source.reason };
  const target = routerEndpoint(destination, snapshot, byZid);
  if (target.reason) return { plan: null, reason: target.reason };

  return {
    plan: {
      origin,
      sourceRouter: source.router,
      targetRouter: target.router,
      destination,
    },
    reason: null,
  };
}

/** A successful zero-hop trace when both nodes attach to the same router. */
export function localRouterTrace(plan: RoutePlan): Trace {
  return {
    from: plan.sourceRouter.zid,
    to: plan.targetRouter.zid,
    hops: [],
    arrived: true,
    stopped: null,
  };
}

/** Adds the source/destination access links around Zenoh's router decisions. */
export function resolveRoute(
  snapshot: TopologySnapshot,
  plan: RoutePlan,
  trace: Trace,
): ResolvedRoute {
  if (plan.origin.zid === plan.destination.zid) {
    return {
      zids: [plan.origin.zid],
      segments: [],
      arrived: true,
      stopped: null,
      routerHops: 0,
    };
  }

  const routerZids = [trace.from];
  for (const hop of trace.hops) {
    pushDistinct(routerZids, hop.zid);
    pushDistinct(routerZids, hop.successor);
  }

  const zids: string[] = [];
  if (plan.origin.zid !== plan.sourceRouter.zid) pushDistinct(zids, plan.origin.zid);
  for (const zid of routerZids) pushDistinct(zids, zid);
  if (trace.arrived && plan.destination.zid !== plan.targetRouter.zid) {
    pushDistinct(zids, plan.destination.zid);
  }

  const segments = zids.slice(1).map((to, index) => {
    const from = zids[index] ?? "";
    return { from, to, link: findLink(snapshot.links, from, to) };
  });

  return {
    zids,
    segments,
    arrived: trace.arrived,
    stopped: trace.stopped,
    routerHops: trace.hops.length,
  };
}

interface EndpointResult {
  readonly router: NodeSummary;
  readonly reason: string | null;
}

function routerEndpoint(
  node: NodeSummary,
  snapshot: TopologySnapshot,
  byZid: ReadonlyMap<string, NodeSummary>,
): EndpointResult {
  if (node.kind === "router") return { router: node, reason: null };

  const routers = snapshot.links
    .filter((link) => link.from === node.zid || link.to === node.zid)
    .map((link) => byZid.get(link.from === node.zid ? link.to : link.from))
    .filter((candidate): candidate is NodeSummary => candidate?.kind === "router")
    .sort((left, right) => left.zid.localeCompare(right.zid));

  if (routers.length === 1 && routers[0]) return { router: routers[0], reason: null };
  if (routers.length === 0) {
    return {
      router: node,
      reason: `${node.kind === "client" ? "Client" : "Peer"} has no visible router attachment, so its routed entry point is unknown.`,
    };
  }
  return {
    router: routers[0] ?? node,
    reason: `This ${node.kind} has ${routers.length} router attachments. Select a router directly to trace one unambiguous path.`,
  };
}

function findLink(links: readonly LinkSummary[], from: string, to: string): LinkSummary | null {
  return (
    links.find(
      (link) => (link.from === from && link.to === to) || (link.from === to && link.to === from),
    ) ?? null
  );
}

function pushDistinct(values: string[], value: string): void {
  if (values.at(-1) !== value) values.push(value);
}
