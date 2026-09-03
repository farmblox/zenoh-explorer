import { AlertTriangle } from "lucide-react";

import type { NodeSummary } from "@/ipc";
import { cn } from "@/lib/cn";

export interface RouterAdminWarningProps {
  node: NodeSummary;
  className?: string;
}

/** Explains why the explorer's view behind a known router may be incomplete. */
export function RouterAdminWarning({ node, className }: RouterAdminWarningProps) {
  if (node.kind !== "router" || node.source === "adminSpace") return null;

  return (
    <div
      role="note"
      aria-label="Router status unavailable"
      className={cn(
        "border-warn/40 bg-warn-subtle/40 rounded-panel flex items-start gap-2.5 border px-3 py-2.5",
        className,
      )}
    >
      <AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-small text-warn font-semibold">Router status unavailable</p>
        <p className="text-tiny text-ink-muted mt-1 leading-relaxed">
          This router did not answer at{" "}
          <span className="numeric text-ink break-all">@/{node.zid}/router</span>. Its attached
          peers, locators, and links may be incomplete. Enable{" "}
          <span className="numeric text-ink">adminspace.enabled</span> and allow{" "}
          <span className="numeric text-ink">adminspace.permissions.read</span> on this router.
        </p>
      </div>
    </div>
  );
}
