import { Route, X } from "lucide-react";

import { NodeKindIcon, Zid } from "@/components/domain";
import {
  Badge,
  Button,
  Disclosure,
  FieldRow,
  ListRow,
  ResizablePanel,
  ScrollArea,
} from "@/components/ui";
import type { NodeSummary, TopologySnapshot } from "@/ipc";
import { SOURCE_LABELS } from "../lib/graphMode";
import { label } from "../lib/grouping";

export interface NodeInspectorProps {
  node: NodeSummary;
  snapshot: TopologySnapshot;
  onClose: () => void;
  onSelectNode: (zid: string) => void;
  onTrace: (zid: string) => void;
}

/**
 * Everything known about one node.
 *
 * Sections start closed with their count on the summary row, so the panel opens
 * at the size of the question — which node is this, and how much is behind it —
 * rather than at the size of the answer. Opening one is a decision to read it.
 */
export function NodeInspector({
  node,
  snapshot,
  onClose,
  onSelectNode,
  onTrace,
}: NodeInspectorProps) {
  const neighbours = snapshot.links
    .filter((link) => link.from === node.zid || link.to === node.zid)
    .map((link) => {
      const otherZid = link.from === node.zid ? link.to : link.from;
      return {
        link,
        other: snapshot.nodes.find((candidate) => candidate.zid === otherZid),
        otherZid,
      };
    });

  const unconfirmed = neighbours.filter(({ link }) => !link.bidirectional).length;

  return (
    <ResizablePanel
      id="topology-inspector"
      side="right"
      defaultWidth={340}
      minWidth={280}
      maxWidth={560}
      label="Resize the inspector"
      className="border-line bg-surface-0 border-l"
    >
      <ScrollArea className="flex-1">
        <header className="border-line flex items-center gap-2.5 border-b px-4 py-3.5">
          <NodeKindIcon kind={node.kind} local={node.isLocal} alert={unconfirmed > 0} />
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-base font-medium">{label(node)}</p>
            <Zid zid={node.zid} copyable />
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close inspector">
            <X size={14} />
          </Button>
        </header>

        <div className="border-line-soft border-b p-4">
          <Button
            icon={<Route size={13} />}
            onClick={() => onTrace(node.zid)}
            className="w-full"
            disabled={node.isLocal}
            title={
              node.isLocal
                ? "This is the explorer's own session — it is where every trace ends"
                : undefined
            }
          >
            Trace route to this explorer
          </Button>
        </div>

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
                  None advertised. The node was seen through a link rather than describing itself.
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
              unconfirmed > 0
                ? `${neighbours.length} · ${unconfirmed} unconfirmed`
                : neighbours.length
            }
          >
            <div className="pt-1 pb-2">
              {neighbours.length === 0 ? (
                <p className="text-tiny text-ink-faint px-2 leading-relaxed">
                  No links reported. Either this node is isolated, or its admin space is switched
                  off and only the other end of each link is visible.
                </p>
              ) : (
                neighbours.map(({ link, other, otherZid }) => (
                  <ListRow
                    key={otherZid}
                    size="comfortable"
                    onClick={() => onSelectNode(otherZid)}
                    icon={
                      other ? (
                        <NodeKindIcon kind={other.kind} size="sm" alert={!link.bidirectional} />
                      ) : null
                    }
                    meta={link.protocol}
                    title={link.bidirectional ? undefined : "Only one end reported this link"}
                  >
                    {other ? label(other) : otherZid.slice(0, 8)}
                  </ListRow>
                ))
              )}
            </div>
          </Disclosure>

          {node.metadata ? (
            <Disclosure summary="Advertised metadata" meta="raw">
              <pre className="scroll-thin selectable numeric text-tiny text-ink-muted max-h-72 overflow-auto px-2 pt-1 pb-3 whitespace-pre-wrap">
                {JSON.stringify(node.metadata, null, 2)}
              </pre>
            </Disclosure>
          ) : null}
        </div>
      </ScrollArea>
    </ResizablePanel>
  );
}
