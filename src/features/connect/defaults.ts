/**
 * Starting values for a connection profile.
 *
 * A module of their own so the form file exports only components — otherwise
 * fast refresh gives up on it and every edit reloads the whole dialog.
 */
import type { ConnectionOptions, ConnectionProfile } from "@/ipc";

export const DEFAULT_ADDRESS = "localhost:7447";

/**
 * What the explorer calls itself when the field is left blank.
 *
 * Mirrors `DEFAULT_NAME` in `connection.rs`, which is the one that actually
 * reaches the network — this is only the placeholder that says so.
 */
export const DEFAULT_NAME = "zenoh-explorer";

/**
 * Zenoh's own defaults, with two deliberate exceptions.
 *
 * `multicastListen: false` keeps the explorer from answering other nodes'
 * scouts — it has no business replying to the whole segment.
 *
 * `adminSpace: true` is the opposite call, and they are not in tension: this is
 * about nodes the explorer has already dialled, on a network its operator runs.
 * It is what lets the explorer say who it is instead of turning up as an
 * anonymous client on somebody's router. Read-only — the backend pins
 * `permissions.write` to false.
 *
 * Everything left `null` means "leave Zenoh's default alone" rather than "zero".
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
  // null takes the backend's own default, which is the product name.
  advertisedName: null,
  adminSpace: true,
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

/** Transports the connect form can represent. Anything else dials verbatim. */
const KNOWN_TRANSPORTS = new Set<string>(["tcp", "quic", "tls", "ws", "unixsock-stream", "udp"]);

/**
 * A profile that dials one locator a node advertises.
 *
 * This is what a locator is FOR. Zenoh writes them as
 * `<proto>/<address>[?metadata][#config]`, and they are the addresses a node
 * listens on — which is to say, the thing you put in something else's `connect`
 * to reach it. Turning one into a profile is the difference between the explorer
 * printing an address and the explorer being able to go there.
 *
 * The whole locator goes into `endpoints` verbatim, because that field exists
 * for exactly this and because the metadata and `#config` suffixes are the far
 * node's business, not ours to normalise. `transport` and `address` are filled
 * in alongside it only so the form opens showing something recognisable.
 */
export function profileFromLocator(locator: string, name: string): ConnectionProfile {
  const slash = locator.indexOf("/");
  const scheme = slash === -1 ? "" : locator.slice(0, slash);
  const address = slash === -1 ? locator : locator.slice(slash + 1).split(/[?#]/)[0];

  return {
    ...BLANK_PROFILE,
    name,
    transport: KNOWN_TRANSPORTS.has(scheme) ? (scheme as ConnectionProfile["transport"]) : "tcp",
    address: address ?? DEFAULT_ADDRESS,
    endpoints: [locator],
  };
}
