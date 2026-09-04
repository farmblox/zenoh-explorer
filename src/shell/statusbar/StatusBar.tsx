import { ChevronLeft, ChevronRight } from "lucide-react";

import { StatusDot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pressable } from "@/lib/states";
import { groupedNumber } from "@/lib/format";
import { useActiveSession, useTopology, useUiStore } from "@/stores";
import { describeCoverage } from "@/features/topology";
import { LiveIndicator } from "./LiveIndicator";
import { UpdateStatus } from "./UpdateStatus";

/**
 * The bottom strip.
 *
 * Collapsed it answers the one question that is always worth screen space —
 * am I connected, and to how much? Expanded it adds the counts and feature
 * flags you only want while diagnosing something. Another instance of the
 * progressive-disclosure rule: default to the common question.
 */
export function StatusBar() {
  const expanded = useUiStore((state) => state.statusBarExpanded);
  const toggle = useUiStore((state) => state.toggleStatusBar);

  const session = useActiveSession();
  const { snapshot } = useTopology(session?.id ?? null);
  const coverage = snapshot ? describeCoverage(snapshot) : null;

  const counts = snapshot
    ? snapshot.nodes.reduce(
        (acc, node) => ({ ...acc, [node.kind]: (acc[node.kind] ?? 0) + 1 }),
        {} as Record<string, number>,
      )
    : null;

  return (
    <footer
      className={cn(
        // 20px matches where the sidebar's item labels start, so the two
        // pieces of window chrome share a left edge.
        "bg-surface-0 flex h-8 shrink-0 items-center gap-3 px-5",
        "text-tiny text-ink-muted font-medium",
      )}
    >
      {session ? (
        <>
          <LiveIndicator session={session} />

          <Divider />
          <span>{groupedNumber(snapshot?.nodes.length ?? session.transportCount)} nodes</span>

          {expanded ? (
            <>
              <Divider />
              <span>{groupedNumber(session.keyCount)} keys</span>
              <Divider />
              <span>{session.transportCount} transports</span>
              {counts ? (
                <>
                  <Divider />
                  <span>
                    {counts["router"] ?? 0} routers · {counts["peer"] ?? 0} peers ·{" "}
                    {counts["client"] ?? 0} clients
                  </span>
                </>
              ) : null}
              <Divider />
              <span>
                mode <span className="text-ink-muted">{session.profile.mode}</span>
              </span>
              <Divider />
              <span>
                scouting{" "}
                <span className={session.profile.multicastScouting ? "text-ok" : "text-ink-faint"}>
                  multicast
                </span>{" "}
                ·{" "}
                <span className={session.profile.gossipScouting ? "text-ok" : "text-ink-faint"}>
                  gossip
                </span>
              </span>
            </>
          ) : null}

          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className={cn(
              "rounded-inner hover:text-ink -mx-1 flex shrink-0 items-center gap-1 px-1",
              pressable,
            )}
          >
            {expanded ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Less" : "Details"}
          </button>
        </>
      ) : (
        <span className="flex items-center gap-2">
          <StatusDot status="idle" />
          No session
        </span>
      )}

      <span className="flex-1" />

      {coverage ? (
        <span className="text-warn" title={coverage.detail}>
          {coverage.label}
        </span>
      ) : null}

      <UpdateStatus />
    </footer>
  );
}

function Divider() {
  return <span className="bg-line h-3 w-px shrink-0" aria-hidden />;
}
