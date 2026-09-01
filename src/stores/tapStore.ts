/**
 * Live tap state: the running subscription and its rolling sample window.
 *
 * The two hard requirements here are both about not melting under load.
 *
 *  - **Bounded memory.** The backend already coalesces into batches, but a tap
 *    left running overnight would still accumulate without limit. The store
 *    keeps a fixed-size window and drops the oldest rows.
 *  - **Bounded renders.** Zustand notifies on every `set`, so writing each
 *    batch straight into the store would re-render the table at the flush rate
 *    even when the user is scrolled away. Batches are staged and committed on
 *    an animation frame instead, which collapses several arrivals into one
 *    render and stops entirely when the window is hidden.
 */
import { create } from "zustand";

import { data as dataIpc, toIpcError } from "@/ipc";
import type { SampleBatch, SampleRecord, SessionId, TapSpec } from "@/ipc";

/** Rows held in memory per session. Roughly 20 MB of previews at the cap. */
const WINDOW_SIZE = 20_000;

/** A tap the user has started, plus the handle that stops it. */
interface RunningTap {
  readonly stop: () => Promise<void>;
}

/** Everything the tap view renders for one session. */
export interface TapEntry {
  readonly samples: readonly SampleRecord[];
  readonly spec: TapSpec | null;
  readonly streaming: boolean;
  readonly paused: boolean;
  /** Samples the backend had to discard because its ring filled. */
  readonly dropped: number;
  /** Samples received since the tap started. */
  readonly total: number;
  /** Rows evicted locally to stay inside the window. */
  readonly evicted: number;
  readonly error: string | null;
}

const EMPTY: TapEntry = {
  samples: [],
  spec: null,
  streaming: false,
  paused: false,
  dropped: 0,
  total: 0,
  evicted: 0,
  error: null,
};

interface TapState {
  bySession: Record<string, TapEntry>;

  start(sessionId: SessionId, spec: TapSpec): Promise<void>;
  stop(sessionId: SessionId): Promise<void>;
  /** Freezes the view without dropping the subscription. */
  setPaused(sessionId: SessionId, paused: boolean): void;
  clear(sessionId: SessionId): void;
  forget(sessionId: SessionId): Promise<void>;
}

/** Handles and staged batches live outside the store: neither drives a render. */
const running = new Map<string, RunningTap>();
const staged = new Map<string, SampleBatch[]>();
let frame: number | null = null;

export const useTapStore = create<TapState>()((set, get) => ({
  bySession: {},

  start: async (sessionId, spec) => {
    await get().stop(sessionId);

    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: { ...EMPTY, spec, streaming: true },
      },
    }));

    try {
      const tap = await dataIpc.startTap(sessionId, spec, (batch) => {
        stage(sessionId, batch);
      });
      running.set(sessionId, { stop: tap.stop });
    } catch (thrown) {
      set((state) => ({
        bySession: {
          ...state.bySession,
          [sessionId]: {
            ...(state.bySession[sessionId] ?? EMPTY),
            streaming: false,
            error: toIpcError(thrown).message,
          },
        },
      }));
    }
  },

  stop: async (sessionId) => {
    const tap = running.get(sessionId);
    if (!tap) return;
    running.delete(sessionId);
    staged.delete(sessionId);

    await tap.stop();
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: { ...(state.bySession[sessionId] ?? EMPTY), streaming: false },
      },
    }));
  },

  setPaused: (sessionId, paused) =>
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: { ...(state.bySession[sessionId] ?? EMPTY), paused },
      },
    })),

  clear: (sessionId) =>
    set((state) => ({
      bySession: {
        ...state.bySession,
        [sessionId]: {
          ...(state.bySession[sessionId] ?? EMPTY),
          samples: [],
          evicted: 0,
          dropped: 0,
        },
      },
    })),

  forget: async (sessionId) => {
    await get().stop(sessionId);
    set((state) => {
      const next = { ...state.bySession };
      delete next[sessionId];
      return { bySession: next };
    });
  },
}));

/** Queues a batch and schedules the commit. */
function stage(sessionId: SessionId, batch: SampleBatch): void {
  const queue = staged.get(sessionId);
  if (queue) queue.push(batch);
  else staged.set(sessionId, [batch]);

  // `requestAnimationFrame` does not fire while the window is hidden, so a
  // backgrounded explorer stages batches without rendering — exactly what we
  // want. The window cap below keeps that from growing without bound.
  frame ??= requestAnimationFrame(commit);
}

/** Folds every staged batch into the store in a single update. */
function commit(): void {
  frame = null;
  if (staged.size === 0) return;

  const pending = new Map(staged);
  staged.clear();

  useTapStore.setState((state) => {
    const bySession = { ...state.bySession };

    for (const [sessionId, batches] of pending) {
      const entry = bySession[sessionId] ?? EMPTY;
      const last = batches.at(-1);

      const totals = {
        dropped: entry.dropped + batches.reduce((sum, b) => sum + b.dropped, 0),
        total: last?.total ?? entry.total,
      };

      // A paused view still tracks counters, so the header keeps counting and
      // the user can see what they are missing before they resume.
      if (entry.paused) {
        bySession[sessionId] = { ...entry, ...totals };
        continue;
      }

      const incoming = batches.flatMap((b) => b.samples);
      const merged = entry.samples.concat(incoming);
      const overflow = Math.max(0, merged.length - WINDOW_SIZE);

      bySession[sessionId] = {
        ...entry,
        ...totals,
        samples: overflow > 0 ? merged.slice(overflow) : merged,
        evicted: entry.evicted + overflow,
      };
    }

    return { bySession };
  });
}

/** The current session's tap entry. */
export function useTap(sessionId: SessionId | null): TapEntry {
  return useTapStore((state) => (sessionId ? (state.bySession[sessionId] ?? EMPTY) : EMPTY));
}
