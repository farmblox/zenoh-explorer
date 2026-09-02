import { AlertTriangle, Database, ShieldOff } from "lucide-react";

import { Badge, Panel, Skeleton } from "@/components/ui";
import { KeyExpr } from "@/components/domain";
import type { AclFinding, StorageCoverage } from "@/ipc";
import type { KeyInsight as Insight } from "../hooks/useKeyInsight";

/** How a storage's expression relates to the key, said in words. */
function coverageWord(coverage: StorageCoverage): string {
  switch (coverage.relation) {
    case "includes":
    case "equals":
      return "all of it";
    case "intersects":
      return "part of it";
    default:
      return "matches";
  }
}

export interface KeyInsightProps {
  insight: Insight;
}

/**
 * Whether this key is durable, and whether anything would stop it arriving.
 *
 * Two panels rather than one: they answer different questions and either can be
 * empty on a perfectly healthy network. Both stay hidden when they have nothing
 * to say — an empty "no policies affect this key" panel on every key in the
 * tree would be noise on the overwhelming majority of deployments, which
 * configure no ACL at all.
 */
export function KeyInsight({ insight }: KeyInsightProps) {
  if (insight.loading) {
    return <Skeleton className="mt-4 h-16 w-full" />;
  }

  const denials = insight.acl.filter((finding) => finding.permission === "deny");
  if (insight.storages.length === 0 && denials.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {denials.length > 0 ? <Denials denials={denials} /> : null}
      {insight.storages.length > 0 ? <Storages storages={insight.storages} /> : null}
    </div>
  );
}

function Denials({ denials }: { denials: readonly AclFinding[] }) {
  return (
    <Panel
      title="Access control would stop this"
      actions={<ShieldOff size={13} className="text-warn" />}
      flush
    >
      <ul className="divide-line-soft divide-y">
        {denials.map((finding) => (
          <li key={`${finding.zid}:${finding.ruleId}:${finding.keyExpr}`} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-small text-ink font-medium">
                {finding.nodeName ?? finding.zid.slice(0, 8)}
              </span>
              <Badge tone="danger">denies subscribing</Badge>
              <span className="text-tiny text-ink-faint">{finding.flows.join(" and ")}</span>
            </div>
            <p className="text-tiny text-ink-muted mt-1">
              Rule <span className="numeric text-ink">{finding.ruleId}</span> covers{" "}
              <KeyExpr value={finding.keyExpr} className="text-tiny" />. Subscribing here will
              return nothing, and nothing will say why.
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Storages({ storages }: { storages: readonly StorageCoverage[] }) {
  // A key kept only in RAM is durable until somebody restarts the node holding
  // it, which is the sort of thing worth learning before rather than after.
  const volatile = storages.every((coverage) => coverage.storage.inMemory);

  return (
    <Panel title="Kept by" actions={<Database size={13} className="text-ink-faint" />} flush>
      <ul className="divide-line-soft divide-y">
        {storages.map((coverage) => (
          <li
            key={`${coverage.storage.zid}:${coverage.storage.name}`}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <span className="text-small text-ink shrink-0 font-medium">
              {coverage.storage.name}
            </span>
            <Badge tone={coverage.relation === "intersects" ? "warn" : "ok"}>
              {coverageWord(coverage)}
            </Badge>
            <KeyExpr value={coverage.storage.keyExpr} className="text-tiny min-w-0 flex-1" />
            <span className="numeric text-tiny text-ink-faint shrink-0">
              {coverage.storage.volume}
            </span>
          </li>
        ))}
      </ul>
      {volatile ? (
        <p className="text-tiny text-ink-muted border-line-soft flex items-start gap-2 border-t px-4 py-2.5">
          <AlertTriangle size={13} className="text-warn mt-px shrink-0" />
          <span>
            Only in memory. Zenoh's built-in volume is not persistent, so this data lasts until the
            node holding it restarts.
          </span>
        </p>
      ) : null}
    </Panel>
  );
}
