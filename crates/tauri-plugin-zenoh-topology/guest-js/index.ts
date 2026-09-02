/** TypeScript client for the `zenoh-topology` plugin. */
import { invoke } from "@tauri-apps/api/core";

import type { ScoutedNode } from "@/ipc/generated/ScoutedNode";
import type { Trace } from "@/ipc/generated/Trace";
import type { SessionId } from "@/ipc/generated/SessionId";

/**
 * Re-reads everything this session can be asked for.
 *
 * Returns nothing. Results arrive as `topologyUpdated` and `keyspaceChanged`
 * events, the same way every other change does — the frontend has one way in,
 * not two that can disagree.
 *
 * Rarely needed: transports, declarations and samples all arrive unprompted,
 * and the topology re-probes whenever they report the network moved. This is
 * for the case the live signals cannot see, most often `adminspace.enabled`
 * being switched on after the explorer connected.
 */
export function resync(sessionId: SessionId): Promise<void> {
  return invoke("plugin:zenoh-topology|resync", { sessionId });
}

/**
 * Listens for scout replies.
 *
 * Takes no session: scouting is how the explorer finds networks it has not
 * connected to yet.
 */
export function scout(durationMs?: number): Promise<ScoutedNode[]> {
  return invoke("plugin:zenoh-topology|scout", { durationMs });
}

/**
 * The path a message would take between two nodes.
 *
 * A graph shows which links exist; this shows which one Zenoh would pick. Only
 * routers hold a routing table, so a trace that starts at a client or peer
 * stops immediately with `noSuccessor` — that is the near end having nothing to
 * report, not a fault.
 */
export function routeTrace(sessionId: SessionId, from: string, to: string): Promise<Trace> {
  return invoke("plugin:zenoh-topology|route_trace", { sessionId, from, to });
}
