/**
 * Topology snapshots, one per session.
 *
 * Snapshots are PUSHED. The backend re-probes whenever the network reports it
 * moved — a transport opening, a node declaring something — and broadcasts the
 * result as `topologyUpdated`. Nothing here fetches; this store's whole job is
 * to hold what arrived and say when.
 *
 * That is why there is no `refresh`. A view that could pull would eventually
 * disagree with a view that waited, and the first thing a user would notice is
 * two screens showing different networks.
 */
import { create } from "zustand";

import { topology as topologyIpc, toIpcError } from "@/ipc";
import type { SessionId, TopologySnapshot } from "@/ipc";

/** Per-session state, so a session with no snapshot yet can say so in place. */
export interface TopologyEntry {
  readonly snapshot: TopologySnapshot | null;
  /** `true` until the first snapshot for this session arrives. */
  readonly awaiting: boolean;
  /** When the snapshot last changed, for the live indicator. */
  readonly updatedAtMs: number | null;
  readonly error: string | null;
}

const EMPTY: TopologyEntry = {
  snapshot: null,
  awaiting: true,
  updatedAtMs: null,
  error: null,
};

interface TopologyState {
  bySession: Record<string, TopologyEntry>;

  /** Records a snapshot that arrived as a broadcast. */
  ingest(sessionId: SessionId, snapshot: TopologySnapshot): void;
  /**
   * Asks the backend to read everything again.
   *
   * Not needed in normal use — see `topology.resync`. The result comes back as
   * a broadcast like any other change, so this returns nothing.
   */
  resync(sessionId: SessionId): Promise<void>;
  /** Drops a session's data when its tab closes. */
  forget(sessionId: SessionId): void;
}

export const useTopologyStore = create<TopologyState>()((set) => ({
  bySession: {},

  ingest: (sessionId, snapshot) =>
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: {
          snapshot,
          awaiting: false,
          updatedAtMs: snapshot.capturedAtMs,
          error: null,
        },
      },
    })),

  resync: async (sessionId) => {
    try {
      await topologyIpc.resync(sessionId);
    } catch (thrown) {
      set((state) => ({
        bySession: {
          ...state.bySession,
          [sessionId]: {
            // Keep the last good snapshot on screen; a failed read should not
            // blank a graph the user is reading.
            ...(state.bySession[sessionId] ?? EMPTY),
            error: toIpcError(thrown).message,
          },
        },
      }));
    }
  },

  forget: (sessionId) =>
    set((state) => {
      const next = { ...state.bySession };
      delete next[sessionId];
      return { bySession: next };
    }),
}));

/** The current session's topology entry. */
export function useTopology(sessionId: SessionId | null): TopologyEntry {
  return useTopologyStore((state) => (sessionId ? (state.bySession[sessionId] ?? EMPTY) : EMPTY));
}
