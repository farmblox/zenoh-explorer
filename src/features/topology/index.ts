/**
 * The topology feature.
 *
 * The grouping and region-naming helpers are exported because the Regions view
 * reads the same snapshot and must reach the same conclusions — two independent
 * groupings of one snapshot would disagree the first time either changed.
 */
export { TopologyView } from "./TopologyView";
export {
  buildRegionView,
  label as nodeLabel,
  UNGROUPED,
  type Region,
  type RegionLink,
} from "./lib/grouping";
export {
  neighbourhoodOf,
  neighboursOf,
  singleHomedCount,
  unconfirmedCount,
  type Hop,
  type Neighbour,
} from "./lib/neighbours";
export { describeCoverage, type Coverage } from "./lib/coverage";
export { NodeInspector, type NodeInspectorProps } from "./components/NodeInspector";
export { SOURCE_LABELS } from "./lib/sources";
export { describeRegion, describeRoutingRegion, type RegionDescription } from "./lib/regionLabel";
