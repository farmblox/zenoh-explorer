/**
 * Starting values for a connection profile.
 *
 * A module of their own so the form file exports only components — otherwise
 * fast refresh gives up on it and every edit reloads the whole dialog.
 */
import type { ConnectionOptions, ConnectionProfile } from "@/ipc";

export const DEFAULT_ADDRESS = "localhost:7447";

/**
 * Zenoh's own defaults, with one deliberate exception.
 *
 * `multicastListen: false` keeps the explorer from answering other nodes'
 * scouts — it is here to watch, not to be discovered. Everything left `null`
 * means "leave Zenoh's default alone" rather than "zero".
 */
export const DEFAULT_OPTIONS: ConnectionOptions = {
  connectTimeoutMs: null,
  retry: null,
  scoutingTimeoutMs: null,
  scoutingDelayMs: null,
  multicastAddress: null,
  multicastInterface: null,
  multicastTtl: null,
  multicastListen: false,
  open: { connectScouted: true, declares: true },
};

/** A blank profile, for the "New connection" state. */
export const BLANK_PROFILE: ConnectionProfile = {
  name: "",
  mode: "client",
  transport: "tcp",
  address: DEFAULT_ADDRESS,
  endpoints: [],
  listen: [],
  tls: {
    rootCa: null,
    clientCert: null,
    clientKey: null,
    enableMtls: false,
    verifyNameOnConnect: true,
  },
  multicastScouting: true,
  gossipScouting: true,
  options: DEFAULT_OPTIONS,
  advancedJson5: null,
};

/** Pulls a readable label out of an address: `router.lan:7447` → `router.lan`. */
export function hostOf(address: string): string {
  const trimmed = address.trim();
  if (trimmed.startsWith("/")) return trimmed.split("/").filter(Boolean).at(-1) ?? "socket";
  return trimmed.replace(/:\d+$/, "") || "localhost";
}
