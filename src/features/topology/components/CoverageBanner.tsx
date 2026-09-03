import { Info } from "lucide-react";

import { useCopy } from "@/hooks";
import { Button } from "@/components/ui";
import type { TopologySnapshot } from "@/ipc";
import { cn } from "@/lib/cn";

/** The flag to add to a router so it describes itself. */
const ENABLE_FLAG = "--cfg=adminspace/enabled:true";

export interface CoverageBannerProps {
  snapshot: TopologySnapshot;
}

/**
 * Says when the graph stops at the first hop.
 *
 * Zenoh leaves `adminspace.enabled` off by default, and a network of such routers
 * answers no router-status query at all. The graph is then just the explorer and
 * whatever it is directly connected to — which is a true picture of what can be
 * seen, and a badly misleading picture of the network. Saying so is the
 * difference between "your network is two nodes" and "you are seeing two nodes".
 */
export function CoverageBanner({ snapshot }: CoverageBannerProps) {
  const { copied, copy } = useCopy();

  if (snapshot.adminResponses > 0) return null;

  return (
    <div
      className={cn(
        "border-line-soft bg-surface-2 flex shrink-0 items-start gap-2.5 border-b px-5 py-2.5",
      )}
    >
      <Info size={14} className="text-accent mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-small text-ink">
          Showing directly connected nodes only — no router status record answered.
        </p>
        <p className="text-tiny text-ink-faint mt-0.5">
          Routers describe their live sessions through{" "}
          <span className="numeric text-ink-muted">@/&lt;zid&gt;/router</span>, which Zenoh leaves
          disabled by default. Start a router with{" "}
          <span className="numeric text-ink-muted">{ENABLE_FLAG}</span> to see past the first hop.
        </p>
      </div>
      <Button size="sm" onClick={() => void copy(ENABLE_FLAG)}>
        {copied ? "Copied" : "Copy flag"}
      </Button>
    </div>
  );
}
