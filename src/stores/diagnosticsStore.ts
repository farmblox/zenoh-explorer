/**
 * The events log: diagnostics and lifecycle notices from the backend.
 *
 * This is the view of last resort. When a topology probe comes back empty or a
 * tap silently stops, the reason is here — which is why it is a bounded ring
 * rather than something that can be lost.
 */
import { create } from "zustand";

import type { DiagnosticLevel, SessionId } from "@/ipc";

/** Entries kept before the oldest is dropped. */
const CAPACITY = 500;

/** One line in the events log. */
export interface LogEntry {
  readonly id: number;
  readonly at: number;
  readonly level: DiagnosticLevel;
  readonly message: string;
  readonly hint: string | null;
  readonly sessionId: SessionId | null;
}

interface DiagnosticsState {
  entries: readonly LogEntry[];
  /** Entries the user has not looked at, for the sidebar badge. */
  unread: number;

  record(entry: Omit<LogEntry, "id" | "at">): void;
  markRead(): void;
  clear(): void;
}

let nextId = 0;

export const useDiagnosticsStore = create<DiagnosticsState>()((set) => ({
  entries: [],
  unread: 0,

  record: (entry) =>
    set((state) => {
      const next = [{ ...entry, id: (nextId += 1), at: Date.now() }, ...state.entries];
      return {
        entries: next.length > CAPACITY ? next.slice(0, CAPACITY) : next,
        // Only problems earn a badge; routine notices would make it meaningless.
        unread: entry.level === "info" ? state.unread : state.unread + 1,
      };
    }),

  markRead: () => set({ unread: 0 }),
  clear: () => set({ entries: [], unread: 0 }),
}));
