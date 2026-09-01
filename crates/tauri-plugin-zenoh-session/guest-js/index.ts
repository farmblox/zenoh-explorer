/**
 * TypeScript client for the `zenoh-session` plugin.
 *
 * Lives beside the plugin's Rust source so that a command, its permission and
 * the function the frontend calls it through are all in one directory. Vite
 * maps this to `@plugin/zenoh-session`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { AppEvent } from "@/ipc/generated/AppEvent";
import type { ConnectionProfile } from "@/ipc/generated/ConnectionProfile";
import type { SessionId } from "@/ipc/generated/SessionId";
import type { SessionSummary } from "@/ipc/generated/SessionSummary";
import type { TransportSummary } from "@/ipc/generated/TransportSummary";

/** The single Tauri event every backend broadcast arrives on. */
export const ZENOH_EVENT = "zenoh://event";

/** Opens a session against the network described by `profile`. */
export function connect(profile: ConnectionProfile): Promise<SessionId> {
  return invoke("plugin:zenoh-session|connect", { profile });
}

/** Closes a session and everything derived from it. */
export function disconnect(sessionId: SessionId): Promise<void> {
  return invoke("plugin:zenoh-session|disconnect", { sessionId });
}

/** Every open session, oldest first — the order of the tab strip. */
export function listSessions(): Promise<SessionSummary[]> {
  return invoke("plugin:zenoh-session|list_sessions");
}

/** One session's summary. */
export function sessionSummary(sessionId: SessionId): Promise<SessionSummary> {
  return invoke("plugin:zenoh-session|session_summary", { sessionId });
}

/** Transports the session holds open right now. */
export function transports(sessionId: SessionId): Promise<TransportSummary[]> {
  return invoke("plugin:zenoh-session|transports", { sessionId });
}

/**
 * Subscribes to backend broadcasts.
 *
 * One listener for every event kind: the payload is a tagged union, so callers
 * narrow on `event.kind` rather than registering a listener per variant.
 */
export function onEvent(handler: (event: AppEvent) => void): Promise<UnlistenFn> {
  return listen<AppEvent>(ZENOH_EVENT, ({ payload }) => handler(payload));
}
