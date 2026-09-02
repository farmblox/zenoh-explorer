import { ComboBox, Toolbar, ToolbarDivider } from "@/components/ui";
import { groupedNumber } from "@/lib/format";
import { describeRegion } from "../lib/regionLabel";
import type { SourceFilter, SourceOption } from "../lib/sources";

/** One region the graph can be narrowed to. */
export interface RegionOption {
  readonly id: string;
  readonly count: number;
}

export interface TopologyToolbarProps {
  source: SourceFilter;
  sources: readonly SourceOption[];
  onSourceChange: (source: SourceFilter) => void;
  /** `null` when the graph is showing every region. */
  region: string | null;
  regions: readonly RegionOption[];
  onRegionChange: (region: string | null) => void;
  nodeCount: number;
  linkCount: number;
}

/** Stands in for "do not narrow", since a combo box value has to be a string. */
const EVERY_REGION = " all";

/**
 * What the graph is drawn from, and how much of it came back.
 *
 * Two narrowing controls then a count: which part of the network, which
 * evidence, how much. Each box names its current value beside a quiet label, so
 * the bar reads as a sentence about what is on screen rather than as a row of
 * unlabelled dropdowns.
 */
export function TopologyToolbar({
  source,
  sources,
  onSourceChange,
  region,
  regions,
  onRegionChange,
  nodeCount,
  linkCount,
}: TopologyToolbarProps) {
  const total = regions.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <Toolbar>
      <ComboBox
        label="Region"
        value={region ?? EVERY_REGION}
        onChange={(value) => onRegionChange(value === EVERY_REGION ? null : value)}
        mono
        options={[
          { value: EVERY_REGION, label: "all", hint: groupedNumber(total) },
          ...regions.map((entry) => ({
            value: entry.id,
            label: describeRegion(entry.id).id,
            hint: groupedNumber(entry.count),
          })),
        ]}
      />

      <ComboBox
        label="Known from"
        value={source}
        onChange={onSourceChange}
        options={sources.map((option) => ({
          value: option.value,
          label: option.label.toLowerCase(),
          hint: groupedNumber(option.count),
        }))}
      />

      <span className="flex-1" />

      <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
        {groupedNumber(nodeCount)} nodes
      </span>
      <ToolbarDivider />
      <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
        {groupedNumber(linkCount)} links
      </span>
    </Toolbar>
  );
}
