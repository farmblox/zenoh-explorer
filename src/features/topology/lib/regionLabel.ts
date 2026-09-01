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
  /** What it means, in one line. */
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
      description:
        "Nodes that reported no region. Includes the explorer's own session and anything found without reading its admin space.",
      derived: true,
    };
  }

  if (region === "north") {
    return {
      id: region,
      description: "The backbone, and Zenoh's default: router-to-router links.",
      derived: true,
    };
  }

  if (region === "local") {
    return {
      id: region,
      description: "Sessions local to a router rather than reached across the network.",
      derived: true,
    };
  }

  const south = parseSouth(region);
  if (south) {
    return {
      id: region,
      description: `Downstream of a router: peers and ${south.mode}s attached below it. Created automatically by the default gateway policy.`,
      derived: true,
    };
  }

  return { id: region, description: "A configured region name.", derived: false };
}
