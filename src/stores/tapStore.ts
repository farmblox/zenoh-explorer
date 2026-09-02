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

interface StagedWindow {
  tapId: SampleBatch["tapId"];
  samples: SampleRecord[];
  dropped: number;
  total: number;
  /** Rows discarded before a hidden webview got another animation frame. */
  evicted: number;
}

const staged = new Map<string, StagedWindow>();
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

/** Queues a batch into a bounded pre-render window and schedules the commit. */
function stage(sessionId: SessionId, batch: SampleBatch): void {
  const pending = staged.get(sessionId);
  if (pending) {
    pending.samples.push(...batch.samples);
    pending.dropped += batch.dropped;
    pending.total = batch.total;

    const overflow = Math.max(0, pending.samples.length - WINDOW_SIZE);
    if (overflow > 0) {
      pending.samples.splice(0, overflow);
      pending.evicted += overflow;
    }
  } else {
    const overflow = Math.max(0, batch.samples.length - WINDOW_SIZE);
    staged.set(sessionId, {
      tapId: batch.tapId,
      samples: overflow > 0 ? batch.samples.slice(overflow) : [...batch.samples],
      dropped: batch.dropped,
      total: batch.total,
      evicted: overflow,
    });
  }

  // `requestAnimationFrame` does not fire while the window is hidden, so a
  // backgrounded explorer stages without rendering. The same 20k-row cap as
  // the visible window applies here, so a hidden overnight tap cannot grow a
  // second, unbounded queue behind the store.
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

    for (const [sessionId, stagedWindow] of pending) {
      const entry = bySession[sessionId] ?? EMPTY;

      const totals = {
        dropped: entry.dropped + stagedWindow.dropped,
        total: stagedWindow.total,
      };

      // A paused view still tracks counters, so the header keeps counting and
      // the user can see what they are missing before they resume.
      if (entry.paused) {
        bySession[sessionId] = { ...entry, ...totals };
        continue;
      }

      const incoming = stagedWindow.samples;

      // Trim what is about to fall out of the window BEFORE joining, so the
      // copy is proportional to what arrived plus what survives, rather than
      // building a longer array and then discarding the front of it.
      const keep = Math.max(0, WINDOW_SIZE - incoming.length);
      const dropped = Math.max(0, entry.samples.length - keep);
      const samples =
        dropped > 0
          ? [...entry.samples.slice(dropped), ...incoming]
          : [...entry.samples, ...incoming];

      bySession[sessionId] = {
        ...entry,
        ...totals,
        samples,
        evicted: entry.evicted + stagedWindow.evicted + dropped,
      };
    }

    return { bySession };
  });
}

/** The current session's tap entry. */
export function useTap(sessionId: SessionId | null): TapEntry {
  return useTapStore((state) => (sessionId ? (state.bySession[sessionId] ?? EMPTY) : EMPTY));
}

// Exposed only in development, so the design harness can flood the window and
// check the table virtualizes. Stripped from production by the bundler.
if (import.meta.env.DEV) {
  (globalThis as { __ZUSTAND_TAP__?: typeof useTapStore }).__ZUSTAND_TAP__ = useTapStore;
}
