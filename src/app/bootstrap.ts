/**
 * Startup side effects.
 *
 * Everything here runs once, before the first render, and connects the backend
 * to the stores. Keeping it out of components means no `useEffect` races over
 * who subscribes first, and no double-subscription under React's strict mode.
 */
import { session as sessionIpc, type AppEvent } from "@/ipc";
import {
  applyTheme,
  resolveTheme,
  useDiagnosticsStore,
  useLiveStore,
  useSessionStore,
  useTapStore,
  useTopologyStore,
  useUiStore,
} from "@/stores";

/** Routes one backend broadcast to whichever store owns it. */
function dispatch(event: AppEvent): void {
  switch (event.kind) {
    case "sessionOpened":
      void useSessionStore.getState().refresh();
      break;

    case "sessionClosed":
      // Free everything derived from the session, in dependency order: the tap
      // holds a subscription, so it goes first.
      void useTapStore.getState().forget(event.sessionId);
      useTopologyStore.getState().forget(event.sessionId);
      useLiveStore.getState().forget(event.sessionId);
      useUiStore.getState().forgetSession(event.sessionId);
      void useSessionStore.getState().refresh();

      if (event.reason) {
        useDiagnosticsStore.getState().record({
          level: "warning",
          message: `Session closed: ${event.reason}`,
          hint: null,
          sessionId: event.sessionId,
        });
      }
      break;

    case "topologyUpdated":
      useTopologyStore.getState().ingest(event.sessionId, event.snapshot);
      useLiveStore.getState().bump(event.sessionId);
      break;

    case "transportChanged":
      useDiagnosticsStore.getState().record({
        level: event.up ? "info" : "warning",
        message: `Transport ${event.up ? "up" : "down"}: ${event.zid}`,
        hint: null,
        sessionId: event.sessionId,
      });
      // Transport counts are on the tab, so re-read the summaries. The
      // topology re-probes itself — the backend saw this same event first.
      void useSessionStore.getState().refresh();
      useLiveStore.getState().bump(event.sessionId);
      break;

    case "keyspaceChanged":
      // Counts live on the session summary, and the keyspace view re-reads the
      // level it is showing off the back of the same epoch bump.
      void useSessionStore.getState().refresh();
      useLiveStore.getState().bump(event.sessionId);
      break;

    case "diagnostic":
      useDiagnosticsStore.getState().record({
        level: event.level,
        message: event.message,
        hint: event.hint,
        sessionId: event.sessionId,
      });
      break;
  }
}

/** Wires up event listeners and initial state. Returns a teardown function. */
export async function bootstrap(): Promise<() => void> {
  applyTheme(resolveTheme(useUiStore.getState().themePreference));

  // Follow the system when the user has not chosen a theme explicitly.
  const media = globalThis.matchMedia?.("(prefers-color-scheme: light)");
  const onSystemThemeChange = () => {
    if (useUiStore.getState().themePreference === "system") {
      applyTheme(resolveTheme("system"));
    }
  };
  media?.addEventListener("change", onSystemThemeChange);

  const unlistenEvents = await sessionIpc.onEvent(dispatch);

  // Pick up any sessions that survived a webview reload — the Rust side owns
  // them, so they outlive the frontend.
  await useSessionStore.getState().refresh();

  // The resting state of a connection tool is "choose a connection": with
  // nothing connected, every view is empty and the only useful action is behind
  // this dialog. Opens only when no session survived the reload, so a webview
  // refresh mid-session does not interrupt.
  if (useSessionStore.getState().sessions.length === 0) {
    useUiStore.getState().openOverlay("connect");
  }

  return () => {
    unlistenEvents();
    media?.removeEventListener("change", onSystemThemeChange);
  };
}
