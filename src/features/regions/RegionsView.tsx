import { useMemo } from "react";
import { Boxes, Network } from "lucide-react";

import {
  EmptyState,
  Mix,
  Panel,
  ScrollArea,
  SectionLabel,
  Spinner,
  StatCell,
  StatGrid,
} from "@/components/ui";
import { groupedNumber } from "@/lib/format";
import { buildRegionView, describeRegion } from "@/features/topology";
import { useActiveSessionId, useTopology } from "@/stores";
import { ViewHeader } from "@/shell/ViewHeader";

/**
 * Regions, as a list rather than a graph.
 *
 * The topology view answers "how is this network shaped"; this one answers
 * "what is in each part of it, and is any part cut off". Same snapshot, same
 * grouping — a card here and a card on the canvas always agree, because both
 * come from `buildRegionView`.
 */
export function RegionsView() {
  const sessionId = useActiveSessionId();
  const { snapshot, awaiting, error } = useTopology(sessionId);

  const view = useMemo(() => (snapshot ? buildRegionView(snapshot) : null), [snapshot]);

  if (!sessionId) {
    return (
      <EmptyState
        icon={<Boxes />}
        title="No session"
        description="Connect to a Zenoh network to see how it divides into regions."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Regions"
        subtitle={
          view
            ? `${groupedNumber(view.regions.length)} regions · ${groupedNumber(view.links.length)} links between them`
            : "Reading the admin space"
        }
      />

      {error ? (
        <p className="bg-danger-subtle text-tiny text-danger shrink-0 px-5 py-2">{error}</p>
      ) : null}

      <ScrollArea className="flex-1">
        {!view || view.regions.length === 0 ? (
          <EmptyState
            icon={awaiting ? <Spinner /> : <Network />}
            title={awaiting ? "Probing the network" : "No regions"}
            description={
              awaiting
                ? "Querying every reachable node's admin space."
                : "Nothing answered on the admin space, so there is nothing to group. Zenoh leaves adminspace.enabled off by default."
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 p-5">
            {view.regions.map((region) => {
              const description = describeRegion(region.id);
              const trunks = view.links.filter(
                (link) => link.from === region.id || link.to === region.id,
              );
              const neighbours = trunks.map((link) =>
                link.from === region.id ? link.to : link.from,
              );

              return (
                <Panel key={region.id} flush className="flex flex-col">
                  <header className="border-line-soft border-b p-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${
                          trunks.length === 0 ? "bg-warn" : "bg-ok"
                        }`}
                        aria-hidden
                      />
                      <h2 className="numeric text-ink min-w-0 flex-1 truncate text-base font-medium">
                        {description.id}
                      </h2>
                      {region.containsLocal ? (
                        <span className="text-tiny text-accent shrink-0">this explorer</span>
                      ) : null}
                    </div>
                    <p className="text-tiny text-ink-faint mt-2 leading-relaxed">
                      {description.description}
                    </p>
                  </header>

                  <StatGrid columns={2}>
                    <StatCell label="Nodes" value={groupedNumber(region.nodes.length)} size="sm" />
                    <StatCell
                      label="Links out"
                      value={groupedNumber(trunks.length)}
                      tone={trunks.length === 0 ? "warn" : "ink"}
                      size="sm"
                    />
                  </StatGrid>

                  <div className="p-4">
                    <Mix
                      legend
                      segments={[
                        { key: "routers", label: "routers", value: region.routers, tone: "accent" },
                        { key: "peers", label: "peers", value: region.peers, tone: "neutral" },
                        { key: "clients", label: "clients", value: region.clients, tone: "ok" },
                      ]}
                    />

                    <SectionLabel className="mt-4 mb-2">Reaches</SectionLabel>
                    {neighbours.length === 0 ? (
                      <p className="text-tiny text-warn leading-relaxed">
                        No link to any other region. Nothing here can reach the rest of the network
                        except through a node the explorer cannot see.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {neighbours.map((neighbour) => (
                          <span
                            key={neighbour}
                            className="rounded-inner bg-surface-3 text-tiny text-ink-muted numeric px-2 py-1"
                          >
                            {neighbour}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
