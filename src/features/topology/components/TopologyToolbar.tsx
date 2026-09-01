import { ChevronDown, ChevronLeft } from "lucide-react";

import { Button, Menu, SegmentedControl, Toolbar, ToolbarDivider } from "@/components/ui";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { controlBase, overlayStates } from "@/lib/states";
import {
  GRAPH_MODES,
  type GraphMode,
  type SourceFilter,
  type SourceOption,
} from "../lib/graphMode";
import { LAYOUTS, type LayoutMode } from "../lib/layout";

export interface TopologyToolbarProps {
  mode: GraphMode;
  onModeChange: (mode: GraphMode) => void;
  source: SourceFilter;
  sources: readonly SourceOption[];
  onSourceChange: (source: SourceFilter) => void;
  /** Set when a region is open — switches the bar to a breadcrumb. */
  openRegionId: string | null;
  onLeaveRegion: () => void;
  layout: LayoutMode;
  onLayoutChange: (layout: LayoutMode) => void;
  nodeCount: number;
  linkCount: number;
}

/**
 * The controls above the canvas.
 *
 * Two states, because the two levels ask different questions. At the top level
 * you are choosing how to cut the network up and what evidence to trust. Inside
 * a region you already chose, and what you want is a way back out and a way to
 * rearrange what is in front of you.
 */
export function TopologyToolbar({
  mode,
  onModeChange,
  source,
  sources,
  onSourceChange,
  openRegionId,
  onLeaveRegion,
  layout,
  onLayoutChange,
  nodeCount,
  linkCount,
}: TopologyToolbarProps) {
  const active = sources.find((option) => option.value === source) ?? sources[0];

  return (
    <Toolbar>
      {openRegionId === null ? (
        <>
          <SegmentedControl
            label="Group the graph by"
            segments={GRAPH_MODES}
            value={mode}
            onChange={onModeChange}
          />

          <Menu
            label="Choose which discovery sources the graph is drawn from"
            heading="Draw nodes known from"
            items={sources.map((option) => ({
              value: option.value,
              label: option.label,
              hint: groupedNumber(option.count),
              selected: option.value === source,
            }))}
            onSelect={onSourceChange}
            width={244}
            triggerClassName={cn(
              "rounded-control border-line bg-surface-2 flex h-8 items-center gap-2.5 px-3",
              "text-small text-ink-muted hover:text-ink font-medium whitespace-nowrap",
              controlBase,
              overlayStates,
            )}
            trigger={
              <>
                Source: {active?.label.toLowerCase() ?? "every source"}
                <ChevronDown size={13} className="text-ink-faint" />
              </>
            }
          />
        </>
      ) : (
        <>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft size={13} />}
              onClick={onLeaveRegion}
            >
              All regions
            </Button>
            <span className="text-tiny text-ink-faint">/</span>
            <span className="numeric text-small text-ink px-2">{openRegionId}</span>
          </nav>

          <ToolbarDivider />

          <SegmentedControl
            label="Arrange nodes as"
            segments={LAYOUTS}
            value={layout}
            onChange={onLayoutChange}
          />
        </>
      )}

      <span className="flex-1" />

      <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
        {groupedNumber(nodeCount)} nodes · {groupedNumber(linkCount)} links
      </span>
    </Toolbar>
  );
}
