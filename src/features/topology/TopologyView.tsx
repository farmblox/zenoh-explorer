import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Network } from "lucide-react";

import { EmptyState, Spinner } from "@/components/ui";
import { useActiveSessionId, useTopology, useTopologyStore } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";
import { CoverageBanner } from "./components/CoverageBanner";
import { MeshList } from "./components/MeshList";
import { NodeInspector } from "./components/NodeInspector";
import { RouteTracePanel } from "./components/RouteTracePanel";
import { TopologyToolbar } from "./components/TopologyToolbar";
import { buildRegionView, narrowToRegion } from "./lib/grouping";
import { applySourceFilter, sourceOptions, type SourceFilter } from "./lib/sources";

/**
 * The network graph.
 *
 * One screen: the nodes on the left as a list, the graph beside them, the
 * selection in a panel on the right. You land on the network itself — no level
 * above it to get through first, because on a network of a dozen nodes that is
 * friction for no gain. Region narrows the graph from the toolbar, and the
 * Regions view is where regions are the subject.
 *
 * The list is the part that scales. A graph of two thousand nodes is a picture
 * of nothing however it is laid out, so past a few dozen the canvas says as much
 * and asks you to narrow — while the list stays exactly as usable as it was.
 */
/** Stable identity for "nothing is context", so memoised children hold. */
const EMPTY_ANCHORS: ReadonlySet<string> = new Set();

// Sigma, Graphology and the worker are the heaviest frontend dependencies.
// Load them only when a connected session actually has a graph to draw; a cold
// launch into Scouting or Events should not parse a renderer it never mounts.
const TopologyCanvas = lazy(() =>
  import("./components/TopologyCanvas").then((module) => ({ default: module.TopologyCanvas })),
);

export function TopologyView() {
  const sessionId = useActiveSessionId();
  const { snapshot: raw, awaiting, error } = useTopology(sessionId);
  const resync = useTopologyStore((state) => state.resync);

  const [source, setSource] = useState<SourceFilter>("all");
  const [region, setRegion] = useState<string | null>(null);
  const [selectedZid, setSelectedZid] = useState<string | null>(null);
  const [traceFrom, setTraceFrom] = useState<string | null>(null);

  // Ask once if this session has no snapshot yet.
  //
  // The backend probes on its own the moment a session opens and pushes the
  // result, so in the normal case this never fires. It exists because "the graph
  // arrives as an event" has one failure mode with no way out: an event that
  // lands before the frontend is listening leaves the view blank forever.
  useEffect(() => {
    if (sessionId && awaiting) void resync(sessionId);
  }, [sessionId, awaiting, resync]);

  const bySource = useMemo(() => (raw ? applySourceFilter(raw, source) : null), [raw, source]);
  const sources = useMemo(() => (raw ? sourceOptions(raw) : []), [raw]);

  /** Every region present, for the narrowing box. */
  const regions = useMemo(
    () =>
      bySource
        ? buildRegionView(bySource).regions.map((entry) => ({
            id: entry.id,
            count: entry.nodes.length,
          }))
        : [],
    [bySource],
  );

  const narrowed = useMemo(
    () => (bySource && region !== null ? narrowToRegion(bySource, region) : null),
    [bySource, region],
  );

  const snapshot = useMemo(
    () =>
      bySource && narrowed
        ? { ...bySource, nodes: [...narrowed.nodes], links: [...narrowed.links] }
        : bySource,
    [bySource, narrowed],
  );

  /** Nodes on screen only because the narrowed region links to them. */
  const anchors = useMemo(() => narrowed?.anchors ?? EMPTY_ANCHORS, [narrowed]);

  const narrow = useCallback((next: string | null) => {
    setRegion(next);
    setSelectedZid(null);
    setTraceFrom(null);
  }, []);

  const closeTrace = useCallback(() => setTraceFrom(null), []);

  const actions = useMemo(
    () => ({
      onInspect: (zid: string) => setSelectedZid(zid),
      onTrace: (zid: string) => setTraceFrom(zid),
    }),
    [],
  );

  const selectedNode = useMemo(
    () => snapshot?.nodes.find((node) => node.zid === selectedZid) ?? null,
    [snapshot, selectedZid],
  );

  /** Rates keyed by zid. Empty until nodes report throughput. */
  const rates = useMemo(() => new Map<string, number>(), []);

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Network />}
        title="No session"
        description="Connect to a Zenoh network to see its topology."
      />
    );
  }

  const nodeCount = snapshot?.nodes.length ?? 0;
  const linkCount = snapshot?.links.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader title="Topology" />

      {snapshot ? (
        <TopologyToolbar
          source={source}
          sources={sources}
          onSourceChange={setSource}
          region={region}
          regions={regions}
          onRegionChange={narrow}
          nodeCount={nodeCount}
          linkCount={linkCount}
        />
      ) : null}

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      {raw ? <CoverageBanner snapshot={raw} /> : null}

      <div className="flex min-h-0 flex-1">
        {snapshot && nodeCount > 0 ? (
          <MeshList
            nodes={snapshot.nodes}
            links={snapshot.links}
            rates={rates}
            anchors={anchors}
            selectedZid={selectedZid}
            onSelect={(zid) => setSelectedZid(zid === selectedZid ? null : zid)}
          />
        ) : null}

        <div className="relative min-w-0 flex-1">
          {snapshot && nodeCount > 0 ? (
            <Suspense
              fallback={
                <div className="canvas-grid flex h-full items-center justify-center">
                  <Spinner />
                </div>
              }
            >
              <TopologyCanvas
                snapshot={snapshot}
                selectedZid={selectedZid}
                anchors={anchors}
                actions={actions}
                framingKey={`${region ?? "all"}:${source}`}
                onSelectNode={setSelectedZid}
              />
            </Suspense>
          ) : (
            <div className="canvas-grid h-full">
              <EmptyState
                icon={awaiting ? <Spinner /> : <Network />}
                title={awaiting ? "Probing the network" : "Nothing answered"}
                description={
                  awaiting
                    ? "Querying every reachable node's admin space."
                    : source !== "all"
                      ? "No node was discovered through that source. Try drawing from every source."
                      : "No node replied on the admin space. Zenoh ships with adminspace.enabled set to false, so nodes have to opt in before the explorer can read their topology. The graph fills in the moment one does."
                }
              />
            </div>
          )}

          {traceFrom && snapshot ? (
            <RouteTracePanel from={traceFrom} snapshot={snapshot} onClose={closeTrace} />
          ) : selectedNode && snapshot ? (
            <NodeInspector
              node={selectedNode}
              snapshot={snapshot}
              onClose={() => setSelectedZid(null)}
              onSelectNode={setSelectedZid}
              onTrace={setTraceFrom}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
