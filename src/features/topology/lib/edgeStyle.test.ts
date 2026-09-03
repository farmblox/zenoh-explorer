import { describe, expect, it } from "vitest";

import type { LinkSummary, NodeKind, NodeSummary } from "@/ipc";
import { classifyEdge, isObservedOnlyLink } from "./edgeStyle";

function node(zid: string, kind: NodeKind): NodeSummary {
  return {
    zid,
    name: null,
    kind,
    locators: [],
    isLocal: false,
    region: null,
    regionSource: null,
    southRegions: 0,
    plugins: [],
    stats: null,
    acl: null,
    metadata: null,
    source: "linkState",
  };
}

function link(from: string, to: string, inRoutingMap = false): LinkSummary {
  return {
    from,
    to,
    protocol: "tcp",
    region: null,
    bidirectional: false,
    multicast: false,
    inRoutingMap,
    routingCost: inRoutingMap ? 1 : null,
  };
}

const nodes = new Map(
  [node("r1", "router"), node("r2", "router"), node("p1", "peer"), node("c1", "client")].map(
    (entry) => [entry.zid, entry],
  ),
);

describe("topology edge semantics", () => {
  it("gives link-state evidence priority", () => {
    expect(classifyEdge(link("r1", "r2", true), nodes).kind).toBe("routing");
  });

  it("treats router-to-peer and router-to-client sessions as access links", () => {
    expect(classifyEdge(link("r1", "p1"), nodes).kind).toBe("access");
    expect(classifyEdge(link("r1", "c1"), nodes).kind).toBe("access");
    expect(isObservedOnlyLink(link("r1", "c1"), nodes)).toBe(false);
  });

  it("calls out only router transports missing from link-state", () => {
    const transport = link("r1", "r2");
    expect(classifyEdge(transport, nodes).kind).toBe("observed");
    expect(isObservedOnlyLink(transport, nodes)).toBe(true);
  });

  it("keeps non-router mesh links secondary", () => {
    expect(classifyEdge(link("p1", "c1"), nodes).kind).toBe("peer");
  });
});
