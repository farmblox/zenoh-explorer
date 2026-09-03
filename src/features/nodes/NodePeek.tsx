import { useRef } from "react";
import { CornerDownRight, X } from "lucide-react";

import { NodeKindIcon, Zid } from "@/components/domain";
import {
  Badge,
  Button,
  CodeEditor,
  EmptyState,
  Panel,
  ScrollArea,
  SectionLabel,
} from "@/components/ui";
import {
  neighbourhoodOf,
  nodeLabel,
  observedOnlyCount,
  RouterAdminWarning,
  singleHomedCount,
  SOURCE_LABELS,
  type Hop,
} from "@/features/topology";
import { profileFromLocator } from "@/features/connect";
import { useAsync, useDismiss, usePresence } from "@/hooks";
import {
  keyspace,
  type NodeDeclaration,
  type NodeSummary,
  type SessionId,
  type TopologySnapshot,
} from "@/ipc";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { focusRing, pressable, transitionFast } from "@/lib/states";
import { useSessionStore, useUiStore } from "@/stores";

/** How long the exit animation runs. Mirrors `--duration-exit`. */
const EXIT_MS = 120;

export interface NodePeekProps {
  /** `false` while it animates away, still holding the node it was showing. */
  open: boolean;
  node: NodeSummary;
  snapshot: TopologySnapshot;
  /** Needed to ask the index what this node declared. */
  sessionId: SessionId;
  onClose: () => void;
  /** Follows a link to the node at its far end, one peek to the next. */
  onOpenNode: (zid: string) => void;
}

/**
 * The neighbour grid.
 *
 * Columns for the link's own facts, then the onward reach on a second line under
 * them. Two lines rather than two sections: the link to a neighbour and what
 * that neighbour reaches are one thought, and putting them in separate tables
 * meant listing the same six nodes twice in two different visual languages.
 */
const GRID = "grid-cols-[20px_minmax(140px,1.4fr)_76px_84px_150px_112px]";

/**
 * Metadata keys the header already shows.
 *
 * `name` is the title, `location` is the region beside it, `version` sits on the
 * same line. Repeating them in the raw block below made it a restatement of the
 * page rather than the escape hatch it is for.
 */
const SURFACED_METADATA = new Set(["name", "location", "version"]);

/**
 * One node in depth, over the table it came from.
 *
 * A peek rather than a page: the list stays where it was, so reading four nodes
 * in a row costs four clicks instead of eight. It covers the view and not the
 * window, so the sidebar and the session tabs stay put.
 *
 * The page answers one question, and everything is arranged around it — not "what
 * are this node's properties" but **what happens to the network without it**.
 * That is why the single-homed count is called out in words directly under the
 * name, and why every neighbour row carries its onward reach: a peer with
 * nothing else is a peer this node is carrying.
 *
 * The canvas has its own, narrower inspector — a graph you cannot see is worse
 * than a panel you have to scroll. The two share their FACTS, not their layout:
 * every count on both comes from `lib/neighbours`, so they cannot come to
 * disagree about how many links a node has.
 */
export function NodePeek({ open, node, snapshot, sessionId, onClose, onOpenNode }: NodePeekProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, open, onClose);

  const { mounted, state } = usePresence(open, EXIT_MS);

  // Read from the local index, so opening a peek costs no network round trip.
  const { data: declared } = useAsync(
    () => keyspace.nodeDeclarations(sessionId, node.zid),
    `declarations:${sessionId}:${node.zid}`,
  );

  const hops = neighbourhoodOf(node.zid, snapshot);
  const observedOnly = observedOnlyCount(hops);
  const dependents = singleHomedCount(hops);
  const meta =
    node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : null;
  // Only a string is a version. Zenoh writes one, but metadata is free-form and
  // `String({})` would put "[object Object]" on the header line.
  if (!mounted) return null;

  const version = typeof meta?.["version"] === "string" ? meta["version"] : null;

  // Whatever the header has not already said. Dumping the whole object meant the
  // largest block on the page restated the line directly under the title.
  const rest = (() => {
    if (!meta) return null;
    const remaining = Object.fromEntries(
      Object.entries(meta).filter(([key]) => !SURFACED_METADATA.has(key)),
    );
    return Object.keys(remaining).length > 0 ? remaining : null;
  })();

  return (
    <>
      {/* Dims the table without hiding it, so the row you came from is still
          where you left it. */}
      <div
        aria-hidden
        data-state={state}
        className={cn(
          "bg-scrim absolute inset-0 z-30",
          "motion-safe:data-[state=open]:animate-fade-in",
          "motion-safe:data-[state=closed]:animate-[var(--animate-fade-out)]",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        data-state={state}
        aria-label={`${nodeLabel(node)} details`}
        className={cn(
          "absolute inset-y-0 right-0 z-40 flex flex-col",
          "motion-safe:data-[state=open]:animate-slide-in-right",
          "motion-safe:data-[state=closed]:animate-[var(--animate-slide-out-right)]",
          "border-line bg-surface-1 w-[min(940px,80%)] border-l",
          // Deeper and wider than a popover's lift: this is a layer over the
          // whole view, not a panel attached to a control. Themed, because a
          // black at 60% is a lift on a dark ground and a bruise on a pale one.
          "shadow-panel",
        )}
      >
        <header className="border-line shrink-0 border-b px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <NodeKindIcon kind={node.kind} local={node.isLocal} alert={observedOnly > 0} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="text-title text-ink truncate font-medium tracking-tight">
                  {nodeLabel(node)}
                </h2>
                <Badge tone={node.kind === "router" ? "accent" : "neutral"}>{node.kind}</Badge>
                {node.isLocal ? <Badge tone="accent">this explorer</Badge> : null}
                {node.southRegions > 0 ? (
                  <Badge
                    tone="warn"
                    title={`Serves ${node.southRegions} south region${
                      node.southRegions === 1 ? "" : "s"
                    }. What is inside them is hidden from this side by design.`}
                  >
                    gateway
                  </Badge>
                ) : null}
              </div>
              <div className="text-tiny text-ink-faint mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Zid zid={node.zid} copyable />
                <Rule />
                <span
                  className="numeric"
                  title={
                    node.regionSource === "configured"
                      ? "The node's own region_name, from its configuration."
                      : node.regionSource === "metadata"
                        ? "From metadata.location, which an operator set by convention. Zenoh's own region_name is unset on this node."
                        : "Neither region_name nor metadata.location is set on this node."
                  }
                >
                  {node.region ?? "no region"}
                </span>
                {version ? (
                  <>
                    <Rule />
                    <span className="numeric">{version}</span>
                  </>
                ) : null}
                <Rule />
                <span
                  title={
                    node.source === "adminSpace"
                      ? "This router answered its own status record."
                      : node.kind === "router"
                        ? "Another source reported this router, but its own status record did not answer."
                        : node.source === "transport"
                          ? "The explorer holds a direct transport to this node."
                          : "Another network source reported this node."
                  }
                  className={
                    node.kind === "router" && node.source !== "adminSpace" ? "text-warn" : undefined
                  }
                >
                  {SOURCE_LABELS[node.source].toLowerCase()}
                </span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <X size={15} />
            </Button>
          </div>

          {/* The consequence, in words, before any number. This is the one thing
              a person opens a node to find out and the only place the app says
              it. */}
          <p
            className={cn(
              "text-small mt-4 leading-relaxed",
              dependents > 0 ? "text-warn" : "text-ink-muted",
            )}
          >
            {hops.length === 0
              ? "No links reported, so nothing here depends on it — and nothing reaches it either."
              : dependents === 0
                ? `Every one of its ${groupedNumber(hops.length)} neighbours has another way to the network. Losing this node cuts nothing off.`
                : `${groupedNumber(dependents)} of its ${groupedNumber(hops.length)} neighbours reach the network only through this node. Losing it takes ${dependents === 1 ? "that one" : "them"} with it.`}
            {observedOnly > 0 ? (
              <span className="text-ink-faint">
                {" "}
                {groupedNumber(observedOnly)} router{" "}
                {observedOnly === 1 ? "transport is" : "transports are"} outside the current routing
                map.
              </span>
            ) : null}
          </p>
        </header>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-6">
            <RouterAdminWarning node={node} />

            <section>
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <SectionLabel>Neighbours</SectionLabel>
                <span className="numeric text-tiny text-ink-faint">
                  {groupedNumber(hops.length)}
                </span>
                {dependents > 0 ? (
                  // Said once, here, instead of on every row it applies to.
                  <span className="text-tiny text-ink-faint ml-auto">
                    Amber marks a neighbour with no other path out
                  </span>
                ) : null}
              </div>

              {hops.length === 0 ? (
                <Panel>
                  <EmptyState
                    title="No links reported"
                    description={
                      node.kind === "router"
                        ? "Either this router is isolated, or its status record did not answer and only the other end of each link is visible."
                        : "No router session table or direct transport reported a link for this node."
                    }
                  />
                </Panel>
              ) : (
                <div className="border-line rounded-panel overflow-hidden border">
                  <div
                    className={cn(
                      "border-line-soft bg-surface-0 text-micro text-ink-muted grid items-center gap-4 border-b px-4 py-2",
                      "font-semibold tracking-wide uppercase",
                      GRID,
                    )}
                  >
                    <span />
                    <span>Far end</span>
                    <span>Role</span>
                    <span>Protocol</span>
                    <span>Routing region</span>
                    <span className="text-right">Evidence</span>
                  </div>

                  <div className="divide-line-soft divide-y">
                    {hops.map((hop) => (
                      <NeighbourRow key={hop.zid} hop={hop} onOpenNode={onOpenNode} />
                    ))}
                  </div>
                </div>
              )}
            </section>

            <DeclaresSection declared={declared ?? null} kind={node.kind} />

            {node.locators.length > 0 ? (
              <section>
                <div className="mb-1 flex items-baseline gap-2.5">
                  <SectionLabel>Locators</SectionLabel>
                  <span className="numeric text-tiny text-ink-faint">
                    {groupedNumber(node.locators.length)}
                  </span>
                </div>
                <p className="text-tiny text-ink-faint mb-2.5 leading-relaxed">
                  The addresses this node listens on. Open one to connect the explorer to it
                  directly, which is how you see the network from where it stands.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {node.locators.map((locator) => (
                    <LocatorButton
                      key={locator}
                      locator={locator}
                      name={nodeLabel(node)}
                      onOpened={onClose}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {rest ? (
              <section>
                <SectionLabel className="mb-2.5">Other metadata</SectionLabel>
                <div className="border-line-soft bg-surface-0 rounded-panel h-72 overflow-hidden border">
                  <CodeEditor label="Node metadata" value={JSON.stringify(rest, null, 2)} />
                </div>
              </section>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

/** One neighbour: the link's facts, then what that neighbour reaches. */
function NeighbourRow({ hop, onOpenNode }: { hop: Hop; onOpenNode: (zid: string) => void }) {
  const label = hop.node ? nodeLabel(hop.node) : hop.zid.slice(0, 8);

  return (
    <div
      title={
        hop.singleHomed
          ? `${label} has no link except this one, so it reaches the network only through this node`
          : undefined
      }
      className="hover:bg-surface-2/50 px-4 py-2.5 transition-colors duration-(--duration-fast)"
    >
      <div className={cn("text-small grid items-center gap-4", GRID)}>
        {hop.node ? (
          <NodeKindIcon
            kind={hop.node.kind}
            size="sm"
            local={hop.node.isLocal}
            alert={hop.singleHomed}
          />
        ) : (
          <span className="text-ink-faint text-center">?</span>
        )}

        <button
          type="button"
          onClick={() => onOpenNode(hop.zid)}
          className={cn(
            "rounded-inner text-ink hover:text-accent -mx-1 min-w-0 truncate px-1 text-left",
            pressable,
          )}
        >
          {label}
        </button>

        <span className="text-ink-muted truncate">{hop.node?.kind ?? "unknown"}</span>
        <span className="numeric text-ink-muted truncate">{hop.link.protocol ?? "–"}</span>
        <span
          className={cn("truncate", hop.link.region ? "numeric text-ink-muted" : "text-ink-faint")}
        >
          {hop.link.region ?? "–"}
        </span>
        <span className="truncate text-right">
          {hop.link.inRoutingMap ? (
            <span className="text-accent">link-state</span>
          ) : hop.observedOnly ? (
            <span className="text-warn" title="Absent from the current link-state map">
              session only
            </span>
          ) : (
            <span className="text-ink-faint">session</span>
          )}
        </span>
      </div>

      {/* Where this neighbour goes next, on a second line under its name rather
          than in a column of its own: the count runs from none to dozens and no
          column width fits both. A neighbour with nowhere else to go gets no
          second line — its amber glyph says so, and so does the sentence at the
          top of the panel. The rows that are taller are the ones with more in
          them, which is the point. */}
      {hop.onward.length > 0 ? (
        <div className="mt-1.5 flex min-w-0 items-start gap-2 pl-9">
          <CornerDownRight size={12} className="text-ink-disabled mt-1 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {hop.onward.map((onward) => (
              <button
                key={onward.zid}
                type="button"
                onClick={() => onOpenNode(onward.zid)}
                title={onward.zid}
                className={cn(
                  "rounded-inner bg-surface-2 hover:bg-surface-3 flex items-center gap-1.5 py-0.5 pr-2 pl-1.5",
                  "text-tiny text-ink-muted hover:text-ink",
                  focusRing,
                  transitionFast,
                )}
              >
                <NodeKindIcon kind={onward.kind} size="sm" local={onward.isLocal} />
                {nodeLabel(onward)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Rule() {
  return <span className="bg-line h-2.5 w-px shrink-0" aria-hidden />;
}

/**
 * What the node asked the network for.
 *
 * The other half of a node. Everything above says how it is wired; this says
 * what it does with the wiring — the expressions it subscribes to and the ones
 * it answers queries on, exactly as it declared them, wildcards and all.
 *
 * Subscribers and queryables are separated rather than mixed, because they are
 * opposite roles: a subscriber consumes what others publish, a queryable is
 * something others can ask. A node with fifty of one and none of the other is a
 * different kind of node, and a single merged list hides that.
 */
function DeclaresSection({
  declared,
  kind,
}: {
  declared: readonly NodeDeclaration[] | null;
  kind: NodeSummary["kind"];
}) {
  if (declared === null) return null;

  const subscribers = declared.filter((entry) => entry.kind === "subscriber");
  const publishers = declared.filter((entry) => entry.kind === "publisher");
  const queryables = declared.filter((entry) => entry.kind === "queryable");
  const queriers = declared.filter((entry) => entry.kind === "querier");
  const tokens = declared.filter((entry) => entry.kind === "token");

  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <SectionLabel>Declares</SectionLabel>
        <span className="numeric text-tiny text-ink-faint">{groupedNumber(declared.length)}</span>
      </div>

      {declared.length === 0 ? (
        <p className="text-tiny text-ink-faint leading-relaxed">
          Nothing.{" "}
          {kind === "router"
            ? "A router forwards other nodes' declarations without making any of its own, so this is normal."
            : "This node subscribes to nothing and answers nothing, so no traffic is routed to it."}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <DeclaresList label="Subscribes to" entries={subscribers} />
          <DeclaresList label="Publishes on" entries={publishers} />
          <DeclaresList label="Answers on" entries={queryables} />
          <DeclaresList label="Queries" entries={queriers} />
          {/* Application presence, not node presence: a token exists because
              some app declared one, and vanishes when that app stops. */}
          <DeclaresList label="Alive at" entries={tokens} />
        </div>
      )}
    </section>
  );
}

/** How many expressions to show before the rest are summarised. */
const DECLARE_LIMIT = 12;

function DeclaresList({ label, entries }: { label: string; entries: readonly NodeDeclaration[] }) {
  const shown = entries.slice(0, DECLARE_LIMIT);
  const hidden = entries.length - shown.length;

  return (
    <div className="min-w-0">
      <p className="text-tiny text-ink-faint mb-2">
        {label} <span className="numeric text-ink-muted">{groupedNumber(entries.length)}</span>
      </p>
      {entries.length === 0 ? (
        <p className="text-tiny text-ink-disabled">none</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((entry) => (
            <li
              key={entry.keyExpr}
              title={entry.keyExpr}
              className="numeric selectable text-tiny text-ink-muted truncate"
            >
              {entry.keyExpr}
            </li>
          ))}
          {hidden > 0 ? (
            // A node can hold hundreds. The count is the useful part past a
            // screenful; the Keyspace view is where you go to read them all.
            <li className="text-tiny text-ink-faint pt-0.5">and {groupedNumber(hidden)} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/**
 * One locator, as a way in.
 *
 * Opens the connect dialog with this endpoint filled in rather than connecting
 * outright: a new session is a change to what the whole window is showing, and
 * that is the user's call to confirm, not a side effect of clicking an address.
 */
function LocatorButton({
  locator,
  name,
  onOpened,
}: {
  locator: string;
  name: string;
  onOpened: () => void;
}) {
  const editProfile = useSessionStore((state) => state.editProfile);
  const openOverlay = useUiStore((state) => state.openOverlay);

  return (
    <button
      type="button"
      onClick={() => {
        editProfile(profileFromLocator(locator, name));
        openOverlay("connect");
        onOpened();
      }}
      title={`Open a connection to ${locator}`}
      className={cn(
        "rounded-inner border-line-soft bg-surface-0 hover:border-accent/50 hover:text-ink border",
        "numeric text-tiny text-ink-muted px-2 py-1",
        focusRing,
        transitionFast,
      )}
    >
      {locator}
    </button>
  );
}
