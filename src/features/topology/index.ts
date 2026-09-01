/**
 * The topology feature.
 *
 * The grouping and region-naming helpers are exported because the Regions view
 * reads the same snapshot and must reach the same conclusions — two independent
 * groupings of one snapshot would disagree the first time either changed.
 */
export { TopologyView } from "./TopologyView";
export { buildRegionView, UNGROUPED, type Region, type RegionLink } from "./lib/grouping";
export { describeRegion, type RegionDescription } from "./lib/regionLabel";
