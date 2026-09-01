import { useCallback, useMemo, useState } from "react";
import { Network } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";

import { EmptyState, Spinner } from "@/components/ui";
import { groupedNumber } from "@/lib/format";
import { useActiveSessionId, useTopology } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";
import { CanvasBadge } from "./components/CanvasBadge";
import { CoverageBanner } from "./components/CoverageBanner";
import { MeshList } from "./components/MeshList";
import { NodeInspector } from "./components/NodeInspector";
import { RouteTracePanel } from "./components/RouteTracePanel";
import { TopologyCanvas } from "./components/TopologyCanvas";
import { TopologyToolbar } from "./components/TopologyToolbar";
import type { GraphLevel } from "./hooks/useTopologyGraph";
import {
  applySourceFilter,
  sourceOptions,
  type GraphMode,
  type SourceFilter,
} from "./lib/graphMode";
import { buildRegionDetail } from "./lib/grouping";
import type { LayoutMode } from "./lib/layout";

/**
 * The network graph.
 *
 * Three levels, because a flat picture of two thousand nodes is a picture of
 * nothing: regions collapse to a card each, opening one shows its nodes, and
 * selecting a node opens the inspector. The drill state is local to the view —
 * it is a way of looking at the snapshot, not part of it.
 */
export function TopologyView() {
  const sessionId = useActiveSessionId();
  const { snapshot: raw, awaiting, error } = useTopology(sessionId);

  const [mode, setMode] = useState<GraphMode>("region");
  const [source, setSource] = useState<SourceFilter>("all");
  const [level, setLevel] = useState<GraphLevel>({ kind: "regions" });
  const [selectedZid, setSelectedZid] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutMode>("tree");
  const [traceFrom, setTraceFrom] = useState<string | null>(null);

  const snapshot = useMemo(() => (raw ? applySourceFilter(raw, source) : null), [raw, source]);
  const sources = useMemo(() => (raw ? sourceOptions(raw) : []), [raw]);

  const openRegionAt = useCallback((regionId: string) => {
    setLevel({ kind: "region", regionId });
    setSelectedZid(null);
  }, []);

  const leaveRegion = useCallback(() => {
    setLevel({ kind: "regions" });
    setSelectedZid(null);
  }, []);

  const changeMode = useCallback((next: GraphMode) => {
    setMode(next);
    // Only region mode has a level below the top one, so switching away from it
    // has to put the canvas back somewhere that exists.
    setLevel({ kind: "regions" });
    setSelectedZid(null);
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

  const openRegion = useMemo(
    () =>
      snapshot && mode === "region" && level.kind === "region"
        ? buildRegionDetail(snapshot, level.regionId)
        : null,
    [snapshot, mode, level],
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
      <ViewHeader
        title="Topology"
        subtitle={
          snapshot
            ? `${groupedNumber(nodeCount)} nodes · ${groupedNumber(linkCount)} links`
            : "Reading the admin space"
        }
        alert={snapshot?.partial ? "Partial view" : undefined}
      />

      {snapshot ? (
        <TopologyToolbar
          mode={mode}
          onModeChange={changeMode}
          source={source}
          sources={sources}
          onSourceChange={setSource}
          openRegionId={openRegion ? openRegion.region.id : null}
          onLeaveRegion={leaveRegion}
          layout={layout}
          onLayoutChange={setLayout}
          nodeCount={nodeCount}
          linkCount={linkCount}
        />
      ) : null}

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      {raw ? <CoverageBanner snapshot={raw} /> : null}

      <div className="flex min-h-0 flex-1">
        {openRegion ? (
          <MeshList
            nodes={openRegion.region.nodes}
            rates={rates}
            selectedZid={selectedZid}
            onSelect={(zid) => setSelectedZid(zid === selectedZid ? null : zid)}
          />
        ) : null}

        <div className="relative min-w-0 flex-1">
          {snapshot && nodeCount > 0 ? (
            <>
              <CanvasBadge
                mode={mode}
                detail={
                  openRegion
                    ? `${openRegion.region.id} · ${groupedNumber(openRegion.region.nodes.length)} of ${groupedNumber(nodeCount)} nodes drawn`
                    : `${groupedNumber(nodeCount)} nodes · ${groupedNumber(linkCount)} links drawn`
                }
              />
              {/* The provider must wrap the canvas rather than the app: it owns
                  the store for this graph, and remounting it on session change
                  is exactly what we want. */}
              <ReactFlowProvider>
                <TopologyCanvas
                  snapshot={snapshot}
                  mode={mode}
                  level={level}
                  selectedZid={selectedZid}
                  layout={layout}
                  actions={actions}
                  onOpenRegion={openRegionAt}
                  onSelectNode={setSelectedZid}
                />
              </ReactFlowProvider>
            </>
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
                      : "No node replied on the admin space. Zenoh ships with adminspace.enabled set to false, so nodes have to opt in before the explorer can read their topology. The graph updates itself the moment one does."
                }
              />
            </div>
          )}
        </div>

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
  );
}
