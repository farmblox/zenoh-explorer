import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { NodeKindIcon } from "@/components/domain";
import { Input, ListRow, ResizablePanel, ScrollArea, SegmentedControl } from "@/components/ui";
import type { NodeSummary } from "@/ipc";
import { rate as formatRate, shortZid } from "@/lib/format";
import { label as nodeLabel } from "../lib/grouping";

/** How the list is ordered. */
type SortKey = "traffic" | "name" | "role";

const SORTS = [
  { value: "traffic", label: "Traffic" },
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
] as const satisfies ReadonlyArray<{ value: SortKey; label: string }>;

/** Rank used when sorting by role: backbone first. */
const ROLE_RANK = { router: 0, peer: 1, client: 2 } as const;

export interface MeshListProps {
  nodes: readonly NodeSummary[];
  /** Rate per zid, where the node reported one. */
  rates: ReadonlyMap<string, number>;
  selectedZid: string | null;
  onSelect: (zid: string) => void;
}

/**
 * Every node in the open region, as a list beside the graph.
 *
 * A graph is the wrong tool for "is `rtr-core-b` in here, and what is it
 * doing?" — that is a lookup, and a lookup wants a sorted, filterable list. The
 * two views share a selection, so finding a node here highlights it on the
 * canvas and the other way round.
 */
export function MeshList({ nodes, rates, selectedZid, onSelect }: MeshListProps) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("traffic");

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? nodes.filter(
          (node) =>
            nodeLabel(node).toLowerCase().includes(needle) ||
            node.zid.toLowerCase().includes(needle),
        )
      : [...nodes];

    return matched.sort((a, b) => {
      if (sort === "name") return nodeLabel(a).localeCompare(nodeLabel(b));
      if (sort === "role") {
        return ROLE_RANK[a.kind] - ROLE_RANK[b.kind] || nodeLabel(a).localeCompare(nodeLabel(b));
      }
      // Busiest first; a node reporting nothing sorts below one reporting zero.
      return (rates.get(b.zid) ?? -1) - (rates.get(a.zid) ?? -1);
    });
  }, [nodes, rates, filter, sort]);

  return (
    <ResizablePanel
      id="topology-mesh-list"
      side="left"
      defaultWidth={300}
      minWidth={240}
      maxWidth={520}
      label="Resize the node list"
      className="border-line bg-surface-0 border-r"
    >
      <div className="border-line space-y-2.5 border-b p-3.5">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`Filter ${nodes.length}`}
          prefix={<Search size={13} />}
          spellCheck={false}
          autoComplete="off"
        />
        <SegmentedControl
          label="Sort nodes by"
          segments={SORTS}
          value={sort}
          onChange={setSort}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <ScrollArea className="flex-1">
        {visible.length === 0 ? (
          <p className="text-tiny text-ink-faint px-4 py-3">No node matches “{filter}”.</p>
        ) : (
          visible.map((node) => {
            const rate = rates.get(node.zid);
            const isSelected = node.zid === selectedZid;

            return (
              <ListRow
                key={node.zid}
                selected={isSelected}
                mark={node.isLocal ? "ok" : "none"}
                onClick={() => onSelect(node.zid)}
                icon={<NodeKindIcon kind={node.kind} size="sm" local={node.isLocal} />}
                meta={rate === undefined ? shortZid(node.zid, 4, 4) : formatRate(rate)}
              >
                {nodeLabel(node)}
              </ListRow>
            );
          })
        )}
      </ScrollArea>
    </ResizablePanel>
  );
}
