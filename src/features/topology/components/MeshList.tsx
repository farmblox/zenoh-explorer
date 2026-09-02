import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Input, ListRow, ResizablePanel, SegmentedControl } from "@/components/ui";
import type { LinkSummary, NodeSummary } from "@/ipc";
import { rate as formatRate, shortZid } from "@/lib/format";
import { label as nodeLabel } from "../lib/grouping";
import { TopologyNodeIcon } from "./TopologyNodeIcon";

/** How the list is ordered. */
type SortKey = "traffic" | "name" | "role";

const SORTS = [
  { value: "traffic", label: "Traffic" },
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
] as const satisfies ReadonlyArray<{ value: SortKey; label: string }>;

/** Rank used when sorting by role: backbone first. */
const ROLE_RANK = { router: 0, peer: 1, client: 2 } as const;

/** Compact `ListRow` height; fixed so ten thousand rows need no measuring. */
const ROW_HEIGHT = 32;

/** Rows kept ready above and below the viewport during a fast scroll. */
const OVERSCAN = 12;

export interface MeshListProps {
  nodes: readonly NodeSummary[];
  links: readonly LinkSummary[];
  /** Rate per zid, where the node reported one. */
  rates: ReadonlyMap<string, number>;
  /** Zids listed only as context for a narrowed region. */
  anchors: ReadonlySet<string>;
  selectedZid: string | null;
  onSelect: (zid: string) => void;
}

/**
 * Every node on the canvas, as a list beside it.
 *
 * A graph is the wrong tool for "is `rtr-core-b` in here, and what is it
 * doing?" — that is a lookup, and a lookup wants a sorted, filterable list. The
 * two views share a selection, so finding a node here highlights it on the
 * canvas and the other way round.
 */
export function MeshList({ nodes, links, rates, anchors, selectedZid, onSelect }: MeshListProps) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("traffic");
  const scroll = useRef<HTMLDivElement>(null);

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
      // Context nodes sit at the bottom under every sort: they are on screen to
      // explain the region, not as members of it.
      const context = Number(anchors.has(a.zid)) - Number(anchors.has(b.zid));
      if (context !== 0) return context;
      if (sort === "name") return nodeLabel(a).localeCompare(nodeLabel(b));
      if (sort === "role") {
        return ROLE_RANK[a.kind] - ROLE_RANK[b.kind] || nodeLabel(a).localeCompare(nodeLabel(b));
      }
      // Busiest first; a node reporting nothing sorts below one reporting zero.
      return (rates.get(b.zid) ?? -1) - (rates.get(a.zid) ?? -1);
    });
  }, [nodes, rates, anchors, filter, sort]);

  const alerts = useMemo(() => {
    const linked = new Set<string>();
    const uncertain = new Set<string>();
    for (const link of links) {
      linked.add(link.from);
      linked.add(link.to);
      if (!link.bidirectional) {
        uncertain.add(link.from);
        uncertain.add(link.to);
      }
    }
    return new Set(
      nodes
        .filter((node) => uncertain.has(node.zid) || (!node.isLocal && !linked.has(node.zid)))
        .map((node) => node.zid),
    );
  }, [nodes, links]);

  // The virtualizer returns methods, which React Compiler deliberately leaves
  // alone. Only a few dozen rows are mounted regardless of graph size.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

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
      <div className="border-line space-y-2.5 border-b px-4 py-3.5">
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

      <div
        ref={scroll}
        className="scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
      >
        {visible.length === 0 ? (
          <p className="text-tiny text-ink-faint px-2.5 py-2">No node matches “{filter}”.</p>
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const node = visible[item.index];
              if (!node) return null;
              const rate = rates.get(node.zid);
              const isSelected = node.zid === selectedZid;
              const isContext = anchors.has(node.zid);

              return (
                <div
                  key={node.zid}
                  style={{ transform: `translateY(${item.start}px)` }}
                  className="absolute inset-x-0 top-0"
                >
                  <ListRow
                    selected={isSelected}
                    onClick={() => onSelect(node.zid)}
                    icon={
                      <TopologyNodeIcon
                        kind={node.kind}
                        local={node.isLocal}
                        alert={alerts.has(node.zid)}
                        selected={isSelected}
                        context={isContext}
                      />
                    }
                    // "outside" earns the trailing column over a rate or a zid:
                    // it is the one fact not otherwise present on this row.
                    meta={
                      isContext
                        ? "outside"
                        : rate !== undefined
                          ? formatRate(rate)
                          : node.name
                            ? shortZid(node.zid, 4, 4)
                            : null
                    }
                    className={isContext ? "opacity-[0.62]" : undefined}
                  >
                    {nodeLabel(node)}
                  </ListRow>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ResizablePanel>
  );
}
