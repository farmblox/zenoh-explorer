/**
 * Open sessions — the tab strip, and which tab is active.
 *
 * The backend is the source of truth: this store mirrors what
 * `zenoh-session|list_sessions` reports and never invents a session locally.
 * Every mutation goes out as a command and comes back as an event, so the UI
 * cannot drift from the Zenoh sessions that actually exist.
 */
import { create } from "zustand";

import {
  session as sessionIpc,
  toIpcError,
  type ConnectionProfile,
  type SessionId,
  type SessionSummary,
} from "@/ipc";
import { toast } from "./toastStore";
import { useUiStore } from "./uiStore";

/** A session that is still connecting, or one whose attempt failed. */
export interface PendingSession {
  readonly key: string;
  readonly profile: ConnectionProfile;
  /** Set once the attempt fails. The profile is kept so it can be edited. */
  readonly error?: string | undefined;
}

interface SessionState {
  sessions: SessionSummary[];
  activeId: SessionId | null;
  /** Connection attempts in flight, keyed so several can run at once. */
  pending: PendingSession[];

  /** Re-reads the session list from the backend. */
  refresh(): Promise<void>;
  /** Opens a session and makes it active. */
  connect(profile: ConnectionProfile): Promise<SessionId | null>;
  /** Closes a session and selects a neighbouring tab. */
  disconnect(sessionId: SessionId): Promise<void>;
  setActive(sessionId: SessionId | null): void;
  /** Clears a failed attempt so its tab disappears. */
  dismissPending(key: string): void;
  /**
   * The profile to reopen the connect dialog with.
   *
   * Set when a connection fails, or when the user asks to edit an open
   * session. Cleared once the dialog has consumed it.
   */
  draft: ConnectionProfile | null;
  editProfile(profile: ConnectionProfile): void;
  clearDraft(): void;

  /** The active session, or `null`. */
  active(): SessionSummary | null;
}

let pendingCounter = 0;

export const useSessionStore = create<SessionState>()((set, get) => ({
  sessions: [],
  activeId: null,
  pending: [],
  draft: null,

  refresh: async () => {
    const sessions = await sessionIpc.listSessions();
    set((state) => ({
      sessions,
      // Keep the selection valid if the active session vanished underneath us.
      activeId:
        state.activeId && sessions.some((s) => s.id === state.activeId)
          ? state.activeId
          : (sessions[0]?.id ?? null),
    }));
  },

  connect: async (profile) => {
    const key = `pending-${(pendingCounter += 1)}`;
    set((state) => ({ pending: [...state.pending, { key, profile }] }));

    try {
      const id = await sessionIpc.connect(profile);
      await get().refresh();
      set((state) => ({
        activeId: id,
        pending: state.pending.filter((p) => p.key !== key),
      }));
      return id;
    } catch (thrown) {
      // Keep the failed attempt on the strip WITH its profile, so the user can
      // reopen the dialog and correct it. Losing the profile here was the
      // actual bug: a wrong certificate path meant retyping everything.
      const failure = toIpcError(thrown);
      set((state) => ({
        pending: state.pending.map((p) => (p.key === key ? { ...p, error: failure.message } : p)),
      }));

      toast.error({
        title: "Could not connect",
        body: failure.message,
        remedies: failure.remedies,
        detail: failure.detail,
        action: {
          label: "Edit connection",
          onSelect: () => {
            get().editProfile(profile);
            useUiStore.getState().openOverlay("connect");
          },
        },
      });
      return null;
    }
  },

  disconnect: async (sessionId) => {
    const { sessions, activeId } = get();
    const index = sessions.findIndex((s) => s.id === sessionId);

    await sessionIpc.disconnect(sessionId);

    const remaining = sessions.filter((s) => s.id !== sessionId);
    set({
      sessions: remaining,
      // Select the tab that slid into this one's place, else the last one.
      activeId:
        activeId === sessionId
          ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
          : activeId,
    });
  },

  setActive: (sessionId) => set({ activeId: sessionId }),

  dismissPending: (key) =>
    set((state) => ({ pending: state.pending.filter((p) => p.key !== key) })),

  editProfile: (profile) => set({ draft: profile }),
  clearDraft: () => set({ draft: null }),

  active: () => {
    const { sessions, activeId } = get();
    return sessions.find((s) => s.id === activeId) ?? null;
  },
}));

/** Subscribes to the active session id without re-rendering on unrelated changes. */
export const useActiveSessionId = (): SessionId | null => useSessionStore((s) => s.activeId);

/** Subscribes to the active session summary. */
export const useActiveSession = (): SessionSummary | null =>
  useSessionStore((s) => s.sessions.find((session) => session.id === s.activeId) ?? null);
