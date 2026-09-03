import { X } from "lucide-react";

import { NodeKindIcon, Zid } from "@/components/domain";
import {
  Badge,
  Button,
  CodeEditor,
  Disclosure,
  FieldRow,
  ListRow,
  ResizablePanel,
  ScrollArea,
  TabPanel,
  Tabs,
} from "@/components/ui";
import type { NodeSummary, SessionId, TopologySnapshot } from "@/ipc";
import { SOURCE_LABELS } from "../lib/sources";
import { label } from "../lib/grouping";
import { neighboursOf, observedOnlyCount } from "../lib/neighbours";
import { RouteTraceTab } from "./RouteTraceTab";
import { RouterAdminWarning } from "./RouterAdminWarning";

export type InspectorTab = "details" | "route";

const INSPECTOR_TABS = [
  { value: "details", label: "Details" },
  { value: "route", label: "Route" },
] as const;

export interface NodeInspectorProps {
  node: NodeSummary;
  snapshot: TopologySnapshot;
  sessionId: SessionId;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onRoutePathChange: (zids: readonly string[]) => void;
  onClose: () => void;
  /** Follows a link to the node at its far end. */
  onSelectNode: (zid: string) => void;
}

/**
 * Everything known about one node.
 *
 * Sections start closed with their count on the summary row, so the panel opens
 * at the size of the question — which node is this, and how much is behind it —
 * rather than at the size of the answer. Opening one is a decision to read it.
 *
 * Used by the canvas and by the Nodes table. One component rather than two, so
 * the two screens cannot come to disagree about how many links a node has.
 */
export function NodeInspector({
  node,
  snapshot,
  sessionId,
  tab,
  onTabChange,
  onRoutePathChange,
  onClose,
  onSelectNode,
}: NodeInspectorProps) {
  const neighbours = neighboursOf(node.zid, snapshot);
  const observedOnly = observedOnlyCount(neighbours);

  return (
    <ResizablePanel
      id="topology-inspector"
      side="right"
      defaultWidth={340}
      minWidth={280}
      maxWidth={560}
      label="Resize the inspector"
      className="border-line bg-surface-0 shadow-panel absolute inset-y-0 right-0 z-30 border-l"
    >
      <header className="border-line flex shrink-0 items-center gap-2.5 border-b px-4 py-3.5">
        <NodeKindIcon kind={node.kind} local={node.isLocal} alert={observedOnly > 0} />
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-base font-medium">{label(node)}</p>
          <Zid zid={node.zid} copyable />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close inspector">
          <X size={14} />
        </Button>
      </header>

      <div className="border-line flex shrink-0 border-b px-4 py-2">
        <Tabs
          tabs={INSPECTOR_TABS}
          value={tab}
          onChange={onTabChange}
          label="Node inspector view"
        />
      </div>

      <ScrollArea className="flex-1">
        {tab === "details" ? (
          <TabPanel value="details">
            <RouterAdminWarning node={node} className="m-4" />

            <div className="space-y-0.5 p-2">
              <Disclosure summary="Identity" meta={SOURCE_LABELS[node.source]} defaultOpen>
                <div className="px-2 pb-3">
                  <FieldRow label="Role" mono={false}>
                    <Badge tone={node.kind === "router" ? "accent" : "neutral"}>{node.kind}</Badge>
                  </FieldRow>
                  <FieldRow label="Region" mono={false}>
                    {node.region ?? "not reported"}
                  </FieldRow>
                  <FieldRow label="Discovered via" mono={false}>
                    {SOURCE_LABELS[node.source]}
                  </FieldRow>
                  {node.isLocal ? (
                    <FieldRow label="Session" mono={false}>
                      <span className="text-accent">this explorer</span>
                    </FieldRow>
                  ) : null}
                </div>
              </Disclosure>

              <Disclosure summary="Locators" meta={node.locators.length}>
                <ul className="space-y-1.5 px-2 pt-1 pb-3">
                  {node.locators.length === 0 ? (
                    <li className="text-tiny text-ink-faint">
                      None advertised. The node was seen through a link rather than describing
                      itself.
                    </li>
                  ) : (
                    node.locators.map((locator) => (
                      <li
                        key={locator}
                        className="numeric selectable text-tiny text-ink-muted truncate"
                      >
                        {locator}
                      </li>
                    ))
                  )}
                </ul>
              </Disclosure>

              <Disclosure
                summary="Links"
                meta={
                  observedOnly > 0
                    ? `${neighbours.length} · ${observedOnly} outside map`
                    : neighbours.length
                }
              >
                <div className="pt-1 pb-2">
                  {neighbours.length === 0 ? (
                    <p className="text-tiny text-ink-faint px-2 leading-relaxed">
                      {node.kind === "router"
                        ? "No links reported. Either this router is isolated, or its status record did not answer and only the other end of each link is visible."
                        : "No router session table or direct transport reported a link for this node."}
                    </p>
                  ) : (
                    neighbours.map(
                      ({ link, node: other, zid: otherZid, observedOnly: observed }) => (
                        <ListRow
                          key={otherZid}
                          size="comfortable"
                          onClick={() => onSelectNode(otherZid)}
                          icon={
                            other ? (
                              <NodeKindIcon kind={other.kind} size="sm" alert={observed} />
                            ) : null
                          }
                          meta={linkMeta(link)}
                          title={linkTitle(link, observed)}
                        >
                          {other ? label(other) : otherZid.slice(0, 8)}
                        </ListRow>
                      ),
                    )
                  )}
                </div>
              </Disclosure>

              {node.metadata ? (
                <Disclosure summary="Advertised metadata" meta="raw">
                  <CodeEditor
                    label="Node metadata"
                    value={JSON.stringify(node.metadata, null, 2)}
                    className="h-72"
                  />
                </Disclosure>
              ) : null}
            </div>
          </TabPanel>
        ) : (
          <TabPanel value="route">
            <RouteTraceTab
              sessionId={sessionId}
              from={node.zid}
              snapshot={snapshot}
              onPathChange={onRoutePathChange}
            />
          </TabPanel>
        )}
      </ScrollArea>
    </ResizablePanel>
  );
}

function linkMeta(link: TopologySnapshot["links"][number]): string | null {
  if (link.inRoutingMap) {
    return link.routingCost === null
      ? (link.region ?? "routing")
      : `cost ${formatCost(link.routingCost)}`;
  }
  return link.protocol ?? "access";
}

function linkTitle(link: TopologySnapshot["links"][number], observedOnly: boolean): string {
  if (observedOnly) return "Router transport absent from the current link-state map";
  if (link.inRoutingMap) {
    const region = link.region ? ` in ${link.region}` : "";
    const cost = link.routingCost === null ? "" : ` with cost ${formatCost(link.routingCost)}`;
    return `Zenoh routing link${region}${cost}`;
  }
  return "Router session access link";
}

function formatCost(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
