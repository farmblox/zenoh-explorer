import { UNGROUPED } from "./grouping";

/**
 * Two different things are called a region on a Zenoh network, and only one of
 * them groups nodes.
 *
 * **A node's region** is `metadata.location`, which an operator sets on the
 * node: `edge-fleet`, `plant-b`. It is the one that groups nodes, because a
 * person chose it. [`describeRegion`] labels those.
 *
 * **A routing region** is Zenoh's own, and it belongs to a LINK — which of the
 * routing trees the link sits in. Its `Region` type renders as three shapes:
 *
 *   north              the backbone — router-to-router links, and the default
 *   local              a router's own local sessions
 *   south:{id}:{mode}  a tree below a router, created automatically by the
 *                      default gateway policy, e.g. `south:0:client`
 *
 * A node's links routinely sit in several of these at once, so there is no such
 * thing as the routing region a node is in — which is why it cannot be the one
 * that groups them. [`describeRoutingRegion`] labels a
 * link, and the identifier is shown verbatim: someone reading this view is a
 * Zenoh operator, and `south:0:client` is the term they will find in Zenoh's own
 * documentation, its logs and its admin space. Translating it to "Downstream"
 * would make the app easier to read and harder to act on. The explanation goes
 * beside it instead.
 */
export interface RegionDescription {
  /** The identifier, exactly as reported. */
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
  /** `true` when Zenoh derived this rather than a person naming it. */
  readonly derived: boolean;
}

/** Describes one region of nodes, as named by whoever deployed them. */
export function describeRegion(region: string): RegionDescription {
  if (region === UNGROUPED) {
    return {
      id: "ungrouped",
      summary: "No region set",
      description:
        "Nodes that advertise no region. Set `metadata.location` on a node to place it in one.",
      derived: true,
    };
  }

  return {
    id: region,
    summary: "Advertised region",
    description: `Nodes advertising ${region} as their location in metadata.`,
    derived: false,
  };
}

/** `south:0:client` → `{ id: "0", mode: "client" }`, else null. */
function parseSouth(region: string): { id: string; mode: string } | null {
  const match = /^south:(\d+):(\w+)$/.exec(region);
  if (!match?.[1] || !match[2]) return null;
  return { id: match[1], mode: match[2] };
}

/** Explains the routing region a link belongs to. */
export function describeRoutingRegion(region: string): RegionDescription {
  if (region === "north") {
    return {
      id: region,
      summary: "Router backbone",
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
    description: "A configured routing region name.",
    derived: false,
  };
}
