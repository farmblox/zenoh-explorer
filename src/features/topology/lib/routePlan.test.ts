import { describe, expect, it } from "vitest";

import type { LinkSummary, NodeKind, NodeSummary, TopologySnapshot, Trace } from "@/ipc";
import { localRouterTrace, planRouteToLocal, resolveRoute } from "./routePlan";

function node(zid: string, kind: NodeKind, isLocal = false): NodeSummary {
  return {
    zid,
    name: zid,
    kind,
    locators: [],
    isLocal,
    region: null,
    regionSource: null,
    southRegions: 0,
    plugins: [],
    stats: null,
    acl: null,
    metadata: null,
    source: kind === "router" ? "adminSpace" : "linkState",
  };
}

function link(from: string, to: string, routing = false): LinkSummary {
  return {
    from,
    to,
    protocol: routing ? null : "tcp",
    region: routing ? "north" : null,
    bidirectional: false,
    multicast: false,
    inRoutingMap: routing,
    routingCost: routing ? 1 : null,
  };
}

function snapshot(
  nodes: readonly NodeSummary[],
  links: readonly LinkSummary[],
  localZid = "explorer",
): TopologySnapshot {
  return {
    nodes: [...nodes],
    links: [...links],
    localZid,
    capturedAtMs: 0,
    storages: [],
    unverifiedNodes: 0,
    adminResponses: 2,
  };
}

describe("route planning", () => {
  it("anchors access nodes to their routers and wraps Zenoh's router decisions", () => {
    const graph = snapshot(
      [
        node("source", "peer"),
        node("edge", "router"),
        node("core", "router"),
        node("explorer", "client", true),
      ],
      [link("source", "edge"), link("edge", "core", true), link("core", "explorer")],
    );
    const planned = planRouteToLocal(graph, "source");
    expect(planned.reason).toBeNull();
    if (!planned.plan) throw new Error("route should be plannable");

    const trace: Trace = {
      from: "edge",
      to: "core",
      hops: [{ zid: "edge", successor: "core" }],
      arrived: true,
      stopped: null,
    };
    const route = resolveRoute(graph, planned.plan, trace);

    expect(route.zids).toEqual(["source", "edge", "core", "explorer"]);
    expect(route.segments.map((segment) => segment.link?.inRoutingMap)).toEqual([
      false,
      true,
      false,
    ]);
    expect(route.arrived).toBe(true);
  });

  it("does not guess which attachment a multi-homed node used", () => {
    const graph = snapshot(
      [
        node("source", "peer"),
        node("r1", "router"),
        node("r2", "router"),
        node("explorer", "client", true),
      ],
      [link("source", "r1"), link("source", "r2"), link("explorer", "r1")],
    );

    const result = planRouteToLocal(graph, "source");
    expect(result.plan).toBeNull();
    expect(result.reason).toContain("2 router attachments");
  });

  it("uses a zero-hop trace when source and destination share a router", () => {
    const router = node("r1", "router");
    const graph = snapshot(
      [node("source", "client"), router, node("explorer", "client", true)],
      [link("source", "r1"), link("explorer", "r1")],
    );
    const planned = planRouteToLocal(graph, "source");
    if (!planned.plan) throw new Error("route should be plannable");

    const trace = localRouterTrace(planned.plan);
    const route = resolveRoute(graph, planned.plan, trace);
    expect(trace.hops).toEqual([]);
    expect(route.zids).toEqual(["source", "r1", "explorer"]);
    expect(route.routerHops).toBe(0);
  });

  it("does not leave and re-enter the explorer when tracing the local node", () => {
    const graph = snapshot(
      [node("r1", "router"), node("explorer", "client", true)],
      [link("explorer", "r1")],
    );
    const planned = planRouteToLocal(graph, "explorer");
    if (!planned.plan) throw new Error("route should be plannable");

    const route = resolveRoute(graph, planned.plan, localRouterTrace(planned.plan));
    expect(route.zids).toEqual(["explorer"]);
    expect(route.segments).toEqual([]);
  });
});
