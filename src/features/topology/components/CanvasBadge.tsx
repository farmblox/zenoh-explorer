import { Badge } from "@/components/ui";

export interface CanvasBadgeProps {
  /** What the canvas is showing, in one word — the grouping or routing mode. */
  mode: string;
  /** One line naming what is in focus and how much of it is drawn. */
  detail: string;
}

/**
 * What the canvas is currently showing, floated over its top-left corner.
 *
 * A graph that draws a subset has to say so. Without this line, a canvas
 * showing seven of a node's thirty-four sessions looks exactly like a node with
 * seven sessions, and the tool has quietly lied.
 */
export function CanvasBadge({ mode, detail }: CanvasBadgeProps) {
  return (
    <div className="pointer-events-none absolute top-5 left-5 z-10 flex items-center gap-2.5">
      <Badge tone="accent" mono>
        {mode}
      </Badge>
      <span className="text-tiny text-ink-muted font-medium whitespace-nowrap">{detail}</span>
    </div>
  );
}
