import { describe, expect, it } from "vitest";

import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { buildRegionView, narrowToRegion, UNGROUPED } from "./grouping";

function node(zid: string, kind: NodeSummary["kind"], region: string | null): NodeSummary {
  return {
    zid,
    name: zid,
    kind,
    locators: [],
    isLocal: false,
    region,
    metadata: null,
    source: "adminSpace",
  };
}

function link(from: string, to: string): LinkSummary {
  return { from, to, protocol: "tcp", region: "north", bidirectional: true, multicast: false };
}

/**
 * The shape a real Zenoh network takes: routers in a backbone, and clients that
 * hold one transport each and never talk to one another.
 */
const SNAPSHOT: TopologySnapshot = {
  nodes: [
    node("rtr-a", "router", null),
    node("rtr-b", "router", null),
    node("cli-1", "client", "edge-clients"),
    node("cli-2", "client", "edge-clients"),
    node("agv-7", "peer", "edge-fleet"),
  ],
  links: [
    link("rtr-a", "rtr-b"),
    link("rtr-a", "cli-1"),
    link("rtr-b", "cli-2"),
    link("rtr-a", "agv-7"),
  ],
  localZid: "rtr-a",
  capturedAtMs: 0,
  unverifiedNodes: 0,
  adminResponses: 5,
};

describe("buildRegionView", () => {
  it("groups by advertised location and buckets the rest", () => {
    const view = buildRegionView(SNAPSHOT);
    expect(view.regions.map((region) => region.id)).toEqual([
      "edge-clients",
      UNGROUPED,
      "edge-fleet",
    ]);
  });
});

describe("narrowToRegion", () => {
  it("keeps the routers a group of clients hangs off", () => {
    const narrowed = narrowToRegion(SNAPSHOT, "edge-clients");

    expect([...narrowed.anchors].sort()).toEqual(["rtr-a", "rtr-b"]);
    expect(narrowed.nodes.map((n) => n.zid).sort()).toEqual(["cli-1", "cli-2", "rtr-a", "rtr-b"]);
  });

  it("never draws a node with no links", () => {
    for (const group of ["edge-clients", "edge-fleet", UNGROUPED]) {
      const narrowed = narrowToRegion(SNAPSHOT, group);
      const touched = new Set(narrowed.links.flatMap((l) => [l.from, l.to]));
      expect(
        narrowed.nodes.filter((n) => !touched.has(n.zid)).map((n) => n.zid),
        `orphans while narrowed to ${group}`,
      ).toEqual([]);
    }
  });

  it("drops a link between two anchors, which belongs to their own group", () => {
    // rtr-a -- rtr-b is the backbone. Narrowed to the clients, both routers are
    // context and the trunk between them is not this group's business.
    const narrowed = narrowToRegion(SNAPSHOT, "edge-clients");
    expect(narrowed.links.some((l) => l.from === "rtr-a" && l.to === "rtr-b")).toBe(false);
    expect(narrowed.links).toHaveLength(2);
  });
});
