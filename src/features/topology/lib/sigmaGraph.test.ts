import { describe, expect, it } from "vitest";

import type { LinkSummary, NodeSummary, TopologySnapshot } from "@/ipc";
import { buildSigmaGraph, type SigmaPalette, topologyStructureKey } from "./sigmaGraph";

const PALETTE: SigmaPalette = {
  accent: "#64b0ffff",
  accentStrong: "#97caffff",
  ink: "#f7f8faff",
  inkMuted: "#b6bdc8ff",
  inkFaint: "#a7aebaff",
  inkDisabled: "#7d8590ff",
  surface0: "#0a0c0fff",
  surface1: "#16191eff",
  surface2: "#242a32ff",
  surface3: "#353d47ff",
  line: "#ffffff17",
  ok: "#5fd39aff",
  warn: "#e6b354ff",
  wire: "#ffffff70",
  wireSoft: "#ffffff4d",
  wireStrong: "#ffffff9e",
};

function node(zid: string, kind: NodeSummary["kind"], isLocal = false): NodeSummary {
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
    source: "adminSpace",
  };
}

function link(from: string, to: string, bidirectional = true): LinkSummary {
  return { from, to, protocol: "tcp", region: "north", bidirectional, multicast: false };
}

const SNAPSHOT: TopologySnapshot = {
  nodes: [node("rtr-a", "router", true), node("peer-a", "peer"), node("cli-a", "client")],
  links: [link("rtr-a", "peer-a"), link("peer-a", "cli-a", false)],
  localZid: "rtr-a",
  storages: [],
  capturedAtMs: 1,
  unverifiedNodes: 0,
  adminResponses: 3,
};

describe("buildSigmaGraph", () => {
  it("builds layered role beacons and semantic links", () => {
    const { graph } = buildSigmaGraph(SNAPSHOT, new Set(), new Map(), PALETTE);

    expect(graph.order).toBe(3);
    expect(graph.size).toBe(2);
    expect(graph.getNodeAttribute("rtr-a", "type")).toBe("beacon");
    expect(graph.getNodeAttribute("rtr-a", "size")).toBeGreaterThan(
      graph.getNodeAttribute("peer-a", "size"),
    );
    expect(graph.getNodeAttribute("peer-a", "size")).toBeGreaterThan(
      graph.getNodeAttribute("cli-a", "size"),
    );
    expect(graph.getNodeAttribute("rtr-a", "forceLabel")).toBe(true);

    const uncertain = graph.findEdge((_edge, attributes) => attributes.kind === "unconfirmed");
    expect(uncertain).toBeDefined();
    expect(graph.getEdgeAttribute(uncertain ?? "", "color")).not.toBe("#000000ff");
  });

  it("preserves positions a user moved", () => {
    const { graph } = buildSigmaGraph(
      SNAPSHOT,
      new Set(),
      new Map([["peer-a", { x: 41, y: -17 }]]),
      PALETTE,
    );

    expect(graph.getNodeAttributes("peer-a")).toMatchObject({ x: 41, y: -17 });
  });

  it("does not restart layout for metadata-only updates", () => {
    const changedMetadata = {
      ...SNAPSHOT,
      capturedAtMs: 2,
      nodes: SNAPSHOT.nodes.map((entry) =>
        entry.zid === "peer-a" ? { ...entry, metadata: { version: "1.10" } } : entry,
      ),
    };

    expect(topologyStructureKey(changedMetadata)).toBe(topologyStructureKey(SNAPSHOT));
  });
});
