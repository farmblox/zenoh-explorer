/**
 * When the network last moved.
 *
 * Almost everything in this app is pushed: transports announce themselves,
 * declarations are published as they are made, samples stream. A few things
 * genuinely cannot be — the admin space is a queryable, so a remote node's
 * configuration and link-state have to be asked for.
 *
 * This store is the bridge. The live signals bump an epoch; the views that must
 * ask key their read on it. The result is that a pulling view re-reads exactly
 * when there is something new to read, and never on a timer.
 */
import { create } from "zustand";

import type { SessionId } from "@/ipc";

interface LiveState {
  /** Bumped whenever a session's network reports a change of any kind. */
  epoch: Record<string, number>;
  /** Wall-clock time of that change, for the live indicator. */
  lastChangeMs: Record<string, number>;

  bump(sessionId: SessionId): void;
  forget(sessionId: SessionId): void;
}

export const useLiveStore = create<LiveState>()((set) => ({
  epoch: {},
  lastChangeMs: {},

  bump: (sessionId) =>
    set((state) => ({
      epoch: { ...state.epoch, [sessionId]: (state.epoch[sessionId] ?? 0) + 1 },
      lastChangeMs: { ...state.lastChangeMs, [sessionId]: Date.now() },
    })),

  forget: (sessionId) =>
    set((state) => {
      const epoch = { ...state.epoch };
      const lastChangeMs = { ...state.lastChangeMs };
      delete epoch[sessionId];
      delete lastChangeMs[sessionId];
      return { epoch, lastChangeMs };
    }),
}));

/**
 * A value that changes whenever this session's network does.
 *
 * Pass it into a read key so the read re-runs on a real change rather than on
 * a poll: `useAsync(read, `${sessionId}:${useLiveEpoch(sessionId)}`)`.
 */
export function useLiveEpoch(sessionId: SessionId | null): number {
  return useLiveStore((state) => (sessionId ? (state.epoch[sessionId] ?? 0) : 0));
}

/** When this session's network last reported a change. */
export function useLastChange(sessionId: SessionId | null): number | null {
  return useLiveStore((state) => (sessionId ? (state.lastChangeMs[sessionId] ?? null) : null));
}
