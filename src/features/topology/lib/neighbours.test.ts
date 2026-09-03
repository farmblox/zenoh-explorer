import { describe, expect, it } from "vitest";

import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { neighbourhoodOf, observedOnlyCount, singleHomedCount } from "./neighbours";

function node(zid: string, kind: NodeSummary["kind"]): NodeSummary {
  return {
    zid,
    name: zid,
    kind,
    locators: [],
    isLocal: false,
    regionSource: null,
    southRegions: 0,
    plugins: [],
    stats: null,
    acl: null,
    region: null,
    metadata: null,
    source: "adminSpace",
  };
}

function link(from: string, to: string, inRoutingMap = false): LinkSummary {
  return {
    from,
    to,
    protocol: "tcp",
    region: "north",
    bidirectional: true,
    multicast: false,
    inRoutingMap,
    routingCost: inRoutingMap ? 1 : null,
  };
}

/** rtr-a is the hub; cli-1 hangs off it alone; rtr-b has its own leaf. */
const SNAPSHOT: TopologySnapshot = {
  nodes: [
    node("rtr-a", "router"),
    node("rtr-b", "router"),
    node("cli-1", "client"),
    node("cli-2", "client"),
  ],
  links: [link("rtr-a", "rtr-b", true), link("rtr-a", "cli-1"), link("rtr-b", "cli-2")],
  localZid: "rtr-a",
  capturedAtMs: 0,
  storages: [],
  unverifiedNodes: 0,
  adminResponses: 4,
};

describe("neighbourhoodOf", () => {
  it("reports what each neighbour reaches, excluding the node itself", () => {
    const hops = neighbourhoodOf("rtr-a", SNAPSHOT);
    const byZid = new Map(hops.map((hop) => [hop.zid, hop]));

    // rtr-b's other link is to cli-2. rtr-a must not appear in its own hop.
    expect(byZid.get("rtr-b")?.onward.map((n) => n.zid)).toEqual(["cli-2"]);
    expect(byZid.get("rtr-b")?.onward.some((n) => n.zid === "rtr-a")).toBe(false);
  });

  it("marks a neighbour that reaches the network only through this node", () => {
    const hops = neighbourhoodOf("rtr-a", SNAPSHOT);
    const byZid = new Map(hops.map((hop) => [hop.zid, hop]));

    expect(byZid.get("cli-1")?.singleHomed).toBe(true);
    expect(byZid.get("cli-1")?.onward).toEqual([]);
    expect(byZid.get("rtr-b")?.singleHomed).toBe(false);
    expect(singleHomedCount(hops)).toBe(1);
  });

  it("counts router transports missing from link-state, not access links", () => {
    const snapshot = {
      ...SNAPSHOT,
      links: [...SNAPSHOT.links, link("rtr-a", "rtr-b")],
    };
    expect(observedOnlyCount(neighbourhoodOf("rtr-b", snapshot))).toBe(1);
    expect(observedOnlyCount(neighbourhoodOf("cli-2", snapshot))).toBe(0);
  });

  it("is empty for a node with no links", () => {
    expect(neighbourhoodOf("nobody", SNAPSHOT)).toEqual([]);
  });
});
