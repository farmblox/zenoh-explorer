import { useCallback, useMemo, useState } from "react";
import { Network, Search, Users } from "lucide-react";

import { NodeKindIcon, Zid } from "@/components/domain";
import {
  Badge,
  ComboBox,
  DataTable,
  EmptyState,
  Input,
  Spinner,
  Toolbar,
  ToolbarDivider,
  type Column,
} from "@/components/ui";
import { nodeLabel, SOURCE_LABELS, UNGROUPED } from "@/features/topology";
import type { NodeKind, NodeSummary } from "@/ipc";
import { groupedNumber } from "@/lib/format";
import { useActiveSessionId, useTopology } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";
import { NodePeek } from "./NodePeek";

/** Which roles the table is showing. */
type RoleFilter = "all" | NodeKind;

const ROLES = [
  { value: "all", label: "every role" },
  { value: "router", label: "routers" },
  { value: "peer", label: "peers" },
  { value: "client", label: "clients" },
] as const satisfies ReadonlyArray<{ value: RoleFilter; label: string }>;

/** Rank for the default order: backbone first, then the things attached to it. */
const ROLE_RANK: Record<NodeKind, number> = { router: 0, peer: 1, client: 2 };

/** A row: the node, plus the counts the table shows against it. */
interface Row {
  readonly node: NodeSummary;
  readonly links: number;
  readonly unconfirmed: number;
}

const COLUMNS: readonly Column<Row>[] = [
  {
    id: "kind",
    header: "",
    width: 34,
    resizable: false,
    cell: (row) => <NodeKindIcon kind={row.node.kind} size="sm" local={row.node.isLocal} />,
  },
  {
    id: "name",
    header: "Name",
    width: 200,
    cell: (row) => <span className="text-ink truncate">{nodeLabel(row.node)}</span>,
  },
  {
    id: "role",
    header: "Role",
    width: 84,
    cell: (row) => (
      <Badge tone={row.node.kind === "router" ? "accent" : "neutral"}>{row.node.kind}</Badge>
    ),
  },
  { id: "zid", header: "Zid", width: 180, cell: (row) => <Zid zid={row.node.zid} /> },
  {
    id: "region",
    header: "Region",
    width: 130,
    cell: (row) => (
      <span className={row.node.region ? "numeric text-ink-muted" : "text-ink-faint"}>
        {row.node.region ?? UNGROUPED}
      </span>
    ),
  },
  {
    id: "links",
    header: "Links",
    width: 84,
    align: "right",
    cell: (row) => (
      <span className="numeric">
        <span className="text-ink-muted">{row.links}</span>
        {/* The count alone would hide the interesting half: a node with four
            links, three of which nobody confirmed, is not a well-connected
            node. */}
        {row.unconfirmed > 0 ? (
          <span className="text-warn" title={`${row.unconfirmed} unconfirmed`}>
            {" "}
            ·{row.unconfirmed}
          </span>
        ) : null}
      </span>
    ),
  },
  // Last, because it is the flexible one. A flex column in the middle expands
  // while its content stays short, which opens a hole inside the table instead
  // of leaving slack at the edge where it reads as margin.
  {
    id: "source",
    header: "Known from",
    width: "flex",
    cell: (row) => (
      <span className="text-ink-muted truncate">{SOURCE_LABELS[row.node.source]}</span>
    ),
  },
];

/**
 * Every node on the network, as a table.
 *
 * The topology view answers "what shape is this network"; this one answers "is
 * `rtr-edge-1` here, what is it, and what is it attached to". That is a lookup,
 * and a lookup wants a sorted, filterable table rather than a graph — so this
 * page scales to a network the canvas could never draw legibly.
 *
 * A row opens a peek over the table rather than a page in place of it, so the
 * row you came from is still there when you close it and reading several nodes
 * in a row costs one click each. Following a link inside the peek moves the
 * selection, which keeps the table in step and lets you walk the network
 * outward without ever going back.
 */
export function NodesView() {
  const sessionId = useActiveSessionId();
  const { snapshot, awaiting, error } = useTopology(sessionId);

  const [filter, setFilter] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [openZid, setOpenZid] = useState<string | null>(null);

  const rows = useMemo<readonly Row[]>(() => {
    if (!snapshot) return [];

    const links = new Map<string, { total: number; unconfirmed: number }>();
    for (const link of snapshot.links) {
      for (const end of [link.from, link.to]) {
        const tally = links.get(end) ?? { total: 0, unconfirmed: 0 };
        tally.total += 1;
        if (!link.bidirectional) tally.unconfirmed += 1;
        links.set(end, tally);
      }
    }

    const needle = filter.trim().toLowerCase();
    return snapshot.nodes
      .filter((node) => role === "all" || node.kind === role)
      .filter(
        (node) =>
          needle === "" ||
          nodeLabel(node).toLowerCase().includes(needle) ||
          node.zid.toLowerCase().includes(needle) ||
          (node.region ?? "").toLowerCase().includes(needle),
      )
      .map((node) => {
        const tally = links.get(node.zid);
        return { node, links: tally?.total ?? 0, unconfirmed: tally?.unconfirmed ?? 0 };
      })
      .sort(
        (a, b) =>
          ROLE_RANK[a.node.kind] - ROLE_RANK[b.node.kind] ||
          nodeLabel(a.node).localeCompare(nodeLabel(b.node)),
      );
  }, [snapshot, filter, role]);

  const counts = useMemo(() => {
    const tally: Record<RoleFilter, number> = { all: 0, router: 0, peer: 0, client: 0 };
    for (const node of snapshot?.nodes ?? []) {
      tally.all += 1;
      tally[node.kind] += 1;
    }
    return tally;
  }, [snapshot]);

  const openNode = snapshot?.nodes.find((node) => node.zid === openZid) ?? null;

  // The peek keeps showing the node it had while it animates away. Without
  // this it would empty out the instant you closed it and slide off blank.
  const [lastNode, setLastNode] = useState<NodeSummary | null>(openNode);
  if (openNode !== null && openNode !== lastNode) setLastNode(openNode);
  const peekNode = openNode ?? lastNode;

  const open = useCallback((row: Row) => setOpenZid(row.node.zid), []);
  const close = useCallback(() => setOpenZid(null), []);

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Users />}
        title="No session"
        description="Connect to a Zenoh network to see the nodes on it."
      />
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Nodes"
        subtitle={
          snapshot
            ? `${groupedNumber(counts.router)} routers · ${groupedNumber(counts.peer)} peers · ${groupedNumber(counts.client)} clients`
            : "Reading the network"
        }
      />

      <Toolbar>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name, zid or region"
          prefix={<Search size={13} />}
          spellCheck={false}
          autoComplete="off"
          containerClassName="max-w-[320px] flex-1"
        />
        <ComboBox
          label="Showing"
          value={role}
          onChange={setRole}
          options={ROLES.map((option) => ({
            value: option.value,
            label: option.label,
            hint: groupedNumber(counts[option.value]),
          }))}
        />
        <span className="flex-1" />
        <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
          {groupedNumber(rows.length)} shown
        </span>
        <ToolbarDivider />
        <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
          {groupedNumber(snapshot?.adminResponses ?? 0)} answered
        </span>
      </Toolbar>

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DataTable
          id="nodes"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.node.zid}
          onSelect={open}
          selectedKey={openZid}
          className="min-w-0 flex-1"
          empty={
            <EmptyState
              icon={awaiting ? <Spinner /> : <Network />}
              title={
                awaiting
                  ? "Probing the network"
                  : filter || role !== "all"
                    ? "No match"
                    : "No nodes"
              }
              description={
                awaiting
                  ? "Querying every reachable node's admin space."
                  : filter || role !== "all"
                    ? "Nothing on this network matches. Clear the filter to see every node."
                    : "No node replied on the admin space. Zenoh ships with adminspace.enabled set to false, so nodes have to opt in before the explorer can read them."
              }
            />
          }
        />

        {peekNode && snapshot ? (
          <NodePeek
            open={openNode !== null}
            node={peekNode}
            snapshot={snapshot}
            sessionId={sessionId}
            onClose={close}
            onOpenNode={setOpenZid}
          />
        ) : null}
      </div>
    </div>
  );
}
