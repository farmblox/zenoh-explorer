import { ChevronDown, ChevronLeft } from "lucide-react";

import { Button, Menu, Toolbar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { groupedNumber } from "@/lib/format";
import { controlBase, overlayStates } from "@/lib/states";
import type { SourceFilter, SourceOption } from "../lib/sources";

export interface TopologyToolbarProps {
  source: SourceFilter;
  sources: readonly SourceOption[];
  onSourceChange: (source: SourceFilter) => void;
  /** The session's own name, the first crumb. */
  sessionName: string;
  /** Set when a region is open — switches the bar to a breadcrumb. */
  openRegionId: string | null;
  onLeaveRegion: () => void;
  /** The node selected inside that region, the last crumb. */
  focusLabel: string | null;
  nodeCount: number;
  linkCount: number;
}

/**
 * The controls above the canvas.
 *
 * Two states, because the two levels ask different questions. At the top level
 * you are choosing what evidence to draw from. Inside a region you already
 * chose, and what you want is to know where you are and how to get back out.
 */
export function TopologyToolbar({
  source,
  sources,
  onSourceChange,
  sessionName,
  openRegionId,
  onLeaveRegion,
  focusLabel,
  nodeCount,
  linkCount,
}: TopologyToolbarProps) {
  const active = sources.find((option) => option.value === source) ?? sources[0];

  return (
    <Toolbar>
      {openRegionId === null ? (
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
            "rounded-control bg-surface-2 flex h-8 items-center gap-2.5 px-3",
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
      ) : (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft size={13} />}
            onClick={onLeaveRegion}
          >
            {sessionName}
          </Button>
          <Crumb />
          <span className="numeric text-small text-ink shrink-0 px-1">{openRegionId}</span>
          {focusLabel ? (
            <>
              <Crumb />
              <span className="text-small text-ink-muted min-w-0 truncate px-1">{focusLabel}</span>
            </>
          ) : null}
        </nav>
      )}

      <span className="flex-1" />

      <span className="numeric text-tiny text-ink-faint whitespace-nowrap">
        {groupedNumber(nodeCount)} nodes · {groupedNumber(linkCount)} links
      </span>
    </Toolbar>
  );
}

/** The separator between breadcrumb segments. */
function Crumb() {
  return (
    <span aria-hidden className="text-tiny text-ink-faint shrink-0">
      /
    </span>
  );
}
