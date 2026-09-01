/**
 * The handful of settings that explain the rest of the document.
 *
 * A resolved Zenoh config runs to several hundred lines and almost all of it is
 * defaults nobody set. These are the ones that answer the questions people
 * actually open this view with: why can I see this node at all, what is it, and
 * what is it talking to.
 *
 * `adminspace` leads because it is the answer to the most common one. Zenoh
 * ships it disabled, and a node with it off is a node the explorer can only
 * infer — so seeing `read: true` here is the confirmation that everything else
 * on screen is first-hand.
 */
export interface ConfigHighlights {
  readonly mode: string | null;
  readonly adminRead: boolean | null;
  readonly adminWrite: boolean | null;
  readonly connect: readonly string[];
  readonly listen: readonly string[];
  readonly multicastScouting: boolean | null;
  readonly gossipScouting: boolean | null;
}

/** Reads the highlights out of a parsed config, tolerating any shape. */
export function readHighlights(document: string): ConfigHighlights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    // A config that will not parse is shown raw, and inventing highlights for
    // it would be inventing the very thing the reader is trying to check.
    return null;
  }

  const at = (...path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      parsed,
    );

  const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
  const strings = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  return {
    mode: typeof at("mode") === "string" ? (at("mode") as string) : null,
    adminRead: bool(at("adminspace", "permissions", "read")),
    adminWrite: bool(at("adminspace", "permissions", "write")),
    connect: strings(at("connect", "endpoints")),
    listen: strings(at("listen", "endpoints")),
    multicastScouting: bool(at("scouting", "multicast", "enabled")),
    gossipScouting: bool(at("scouting", "gossip", "enabled")),
  };
}
