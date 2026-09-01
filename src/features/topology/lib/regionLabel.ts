import { UNGROUPED } from "./grouping";

/**
 * Describing Zenoh's region identifiers without renaming them.
 *
 * Zenoh names regions by position in the routing hierarchy, not by geography.
 * Its `Region` type renders as exactly three shapes:
 *
 *   north              the backbone — router-to-router links, and the default
 *   local              a router's own local sessions
 *   south:{id}:{mode}  a downstream subregion, created automatically by the
 *                      default gateway policy, e.g. `south:0:client`
 *
 * The identifier is shown verbatim. Someone reading this view is a Zenoh
 * operator, and `south:0:client` is the term they will find in Zenoh's own
 * documentation, its logs and its admin space — translating it to "Downstream"
 * would make the app easier to read and harder to act on. The explanation goes
 * beside it instead.
 */
export interface RegionDescription {
  /** Zenoh's identifier, exactly as reported. */
  readonly id: string;
  /**
   * Three or four words, for a card.
   *
   * Separate from `description` because a card has room for a label and a
   * tooltip has room for a lesson. Putting the lesson on the card meant
   * truncating it mid-sentence, which taught nobody anything.
   */
  readonly summary: string;
  /** The full explanation, for a tooltip or a list row. */
  readonly description: string;
  /** `true` when Zenoh derived this rather than an operator configuring it. */
  readonly derived: boolean;
}

/** `south:0:client` → `{ id: "0", mode: "client" }`, else null. */
function parseSouth(region: string): { id: string; mode: string } | null {
  const match = /^south:(\d+):(\w+)$/.exec(region);
  if (!match?.[1] || !match[2]) return null;
  return { id: match[1], mode: match[2] };
}

/** Explains one region identifier. */
export function describeRegion(region: string): RegionDescription {
  if (region === UNGROUPED) {
    return {
      id: "ungrouped",
      summary: "No region reported",
      description:
        "Nodes that reported no region. Includes the explorer's own session and anything found without reading its admin space.",
      derived: true,
    };
  }

  if (region === "north") {
    return {
      id: region,
      summary: "Router-to-router backbone",
      description: "The backbone, and Zenoh's default: router-to-router links.",
      derived: true,
    };
  }

  if (region === "local") {
    return {
      id: region,
      summary: "A router's own sessions",
      description: "Sessions local to a router rather than reached across the network.",
      derived: true,
    };
  }

  const south = parseSouth(region);
  if (south) {
    return {
      id: region,
      summary: `Downstream · ${south.mode}s`,
      // Reads the mode straight from the identifier, so `south:0:peer` used to
      // render "peers and peers attached below it".
      description: `Downstream of a router: the ${south.mode}s attached below it. Created automatically by the default gateway policy.`,
      derived: true,
    };
  }

  return {
    id: region,
    summary: "Configured name",
    description: "A configured region name.",
    derived: false,
  };
}
