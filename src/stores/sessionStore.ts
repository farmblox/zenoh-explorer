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
  /**
   * The tab you are on — a session id, or the key of an attempt still being
   * made.
   *
   * One value for both, because a tab is a tab: you are on one of them whatever
   * its connection is doing. Tracking only sessions meant a strip made entirely
   * of in-flight connections had nothing selected, and every tab looked alike.
   */
  activeTab: string | null;
  /** Connection attempts in flight, keyed so several can run at once. */
  pending: PendingSession[];

  /** Re-reads the session list from the backend. */
  refresh(): Promise<void>;
  /** Opens a session and makes it active. */
  connect(profile: ConnectionProfile): Promise<SessionId | null>;
  /** Closes a session and selects a neighbouring tab. */
  disconnect(sessionId: SessionId): Promise<void>;
  /** Selects a tab by its key — a session id or a pending key. */
  setActive(tab: string | null): void;
  /**
   * Abandons a connection attempt, whether it failed or is still running.
   *
   * A connect already in flight cannot be recalled — Zenoh is partway through a
   * handshake — so an abandoned one that later succeeds is closed again rather
   * than adopted. Otherwise cancelling would open the very session it was meant
   * to prevent, some seconds after the tab disappeared.
   */
  dismissPending(key: string): void;
  /**
   * The profile to reopen the connect dialog with.
   *
   * Set when a connection fails, or when the user asks to edit an open
   * session. Cleared once the dialog has consumed it.
   */
  draft: ConnectionProfile | null;
  /**
   * The session the draft is editing, if it is editing one.
   *
   * Zenoh reads `mode` and most of the transport configuration once, at
   * startup, so a live session cannot be reconfigured in place. Editing one
   * means opening a replacement and closing the original — and only in that
   * order, so a change that will not connect leaves you with the session you
   * already had.
   */
  draftReplaces: SessionId | null;
  editProfile(profile: ConnectionProfile, replaces?: SessionId): void;
  clearDraft(): void;

  /** The active session, or `null`. */
  active(): SessionSummary | null;
}

let pendingCounter = 0;

/**
 * Attempts the user gave up on while they were still running.
 *
 * Outside the store because nothing renders from it: it exists only so a
 * connect that resolves after its tab is gone knows to close itself.
 */
const abandoned = new Set<string>();

export const useSessionStore = create<SessionState>()((set, get) => ({
  sessions: [],
  activeTab: null,
  pending: [],
  draft: null,
  draftReplaces: null,

  refresh: async () => {
    const sessions = await sessionIpc.listSessions();
    set((state) => ({
      sessions,
      // Keep the selection valid if the tab it named vanished underneath us.
      // A pending key is still valid here: those live in `pending`, not this
      // list, and refreshing sessions must not deselect one.
      activeTab: isLive(state, sessions) ? state.activeTab : (sessions[0]?.id ?? null),
    }));
  },

  connect: async (profile) => {
    const key = `pending-${(pendingCounter += 1)}`;
    // Selected the moment it appears: you just asked for it, so it is the tab
    // you are on, well before there is a session behind it.
    set((state) => ({ pending: [...state.pending, { key, profile }], activeTab: key }));

    try {
      const id = await sessionIpc.connect(profile);

      // Cancelled while the handshake was still running: close the session
      // Zenoh went ahead and opened, and report nothing.
      if (abandoned.delete(key)) {
        await sessionIpc.disconnect(id);
        return null;
      }

      await get().refresh();
      set((state) => ({
        // The tab does not move; the thing behind it just became a session.
        activeTab: state.activeTab === key ? id : state.activeTab,
        pending: state.pending.filter((p) => p.key !== key),
      }));
      return id;
    } catch (thrown) {
      // Keep the failed attempt on the strip WITH its profile, so the user can
      // reopen the dialog and correct it. Losing the profile here was the
      // actual bug: a wrong certificate path meant retyping everything.
      // Someone who cancelled does not need to be told it then failed.
      if (abandoned.delete(key)) return null;

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
    const { sessions, activeTab, pending } = get();
    const index = sessions.findIndex((s) => s.id === sessionId);

    await sessionIpc.disconnect(sessionId);

    const remaining = sessions.filter((s) => s.id !== sessionId);
    set({
      sessions: remaining,
      // Select the tab that slid into this one's place, else whatever is left.
      activeTab:
        activeTab === sessionId
          ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? pending[0]?.key ?? null)
          : activeTab,
    });
  },

  setActive: (tab) => set({ activeTab: tab }),

  dismissPending: (key) => {
    // Only an attempt still running needs remembering; a failed one has already
    // finished and has nothing left to arrive.
    const { pending, sessions, activeTab } = get();
    if (!pending.find((p) => p.key === key)?.error) abandoned.add(key);

    const remaining = pending.filter((p) => p.key !== key);
    set({
      pending: remaining,
      // Closing the tab you are on has to leave you somewhere.
      activeTab: activeTab === key ? (remaining[0]?.key ?? sessions[0]?.id ?? null) : activeTab,
    });
  },

  editProfile: (profile, replaces) => set({ draft: profile, draftReplaces: replaces ?? null }),
  clearDraft: () => set({ draft: null, draftReplaces: null }),

  active: () => {
    const { sessions, activeTab } = get();
    return sessions.find((s) => s.id === activeTab) ?? null;
  },
}));

/** Whether the selected tab still names something that exists. */
function isLive(state: SessionState, sessions: readonly SessionSummary[]): boolean {
  if (state.activeTab === null) return false;
  return (
    sessions.some((s) => s.id === state.activeTab) ||
    state.pending.some((p) => p.key === state.activeTab)
  );
}

/**
 * The open session behind the selected tab, or `null`.
 *
 * Null while the selected tab is a connection still being made — which is
 * correct: the views have nothing to read yet, and say so.
 */
export const useActiveSessionId = (): SessionId | null =>
  useSessionStore((s) => s.sessions.find((session) => session.id === s.activeTab)?.id ?? null);

/** Subscribes to the active session summary. */
export const useActiveSession = (): SessionSummary | null =>
  useSessionStore((s) => s.sessions.find((session) => session.id === s.activeTab) ?? null);

/** The selected tab's key, whatever kind of tab it is. */
export const useActiveTab = (): string | null => useSessionStore((s) => s.activeTab);

// Exposed only in development, so the design harness can put the tab strip into
// states that need a real network to reach — a connection mid-handshake, a
// failed one. Stripped from production builds by the bundler's dead-code pass.
if (import.meta.env.DEV) {
  (globalThis as { __ZUSTAND_SESSION__?: typeof useSessionStore }).__ZUSTAND_SESSION__ =
    useSessionStore;
}
