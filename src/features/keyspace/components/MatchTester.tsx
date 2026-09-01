import { useState } from "react";

import { Badge, Button, Input, Panel } from "@/components/ui";
import { KeyExpr } from "@/components/domain";
import { keyspace, type KeyExprAnalysis, type MatchResult } from "@/ipc";
import { useAsync } from "@/hooks";

/** Relations, and how each should read at a glance. */
const RELATION_TONE = {
  equals: "ok",
  includes: "ok",
  intersects: "warn",
  disjoint: "neutral",
} as const;

export interface MatchTesterProps {
  /** Expression to start from, usually the selected key. */
  initialExpr: string;
  /** Keys to test against, usually the siblings of the selected key. */
  candidates: readonly string[];
}

/**
 * "Does this match?" — answered by Zenoh, not by a guess.
 *
 * Both the analysis and the verdicts come from `zenoh-keyexpr` over IPC. A
 * JavaScript glob matcher would be faster and would eventually disagree with
 * the router, which is the exact failure this panel exists to prevent.
 */
export function MatchTester({ initialExpr, candidates }: MatchTesterProps) {
  const [expr, setExpr] = useState(initialExpr);

  const analysis = useAsync<KeyExprAnalysis>(
    () => keyspace.analyseKeyExpr(expr),
    `analyse:${expr}`,
    { enabled: expr.length > 0 },
  );

  const matches = useAsync<MatchResult[]>(
    () => keyspace.testKeyExpr(expr, [...candidates]),
    `match:${expr}:${candidates.join(",")}`,
    { enabled: expr.length > 0 && candidates.length > 0 },
  );

  const result = analysis.data;

  return (
    <Panel title="Does this match?" flush>
      <div className="border-line-soft space-y-3 border-b p-4">
        <Input
          value={expr}
          onChange={(event) => setExpr(event.target.value)}
          prefix="key expr"
          mono
          invalid={result ? !result.valid : false}
          spellCheck={false}
          autoComplete="off"
          suffix={
            result?.valid
              ? result.isCanonical
                ? "canonical"
                : "not canonical"
              : result
                ? "invalid"
                : undefined
          }
        />

        {result && !result.valid && result.error ? (
          <p className="text-tiny text-danger">{result.error}</p>
        ) : null}

        {result?.valid && !result.isCanonical && result.canonical ? (
          <div className="text-tiny text-ink-faint flex items-center gap-2">
            Zenoh will canonicalise this to
            <KeyExpr value={result.canonical} className="text-tiny" />
            <Button size="sm" variant="ghost" onClick={() => setExpr(result.canonical ?? expr)}>
              Use it
            </Button>
          </div>
        ) : null}

        {result?.valid ? (
          <div className="flex gap-2">
            <Badge tone="neutral">{result.chunkCount} chunks</Badge>
            {result.hasWildcards ? <Badge tone="accent">wildcards</Badge> : null}
            {result.usesSubChunkWildcard ? (
              <Badge tone="warn" title="$* is matched more slowly than *">
                uses $*
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        {matches.data?.map((match) => (
          <div
            key={match.candidate}
            className="border-line-soft flex items-center gap-3 border-b px-4 py-2 last:border-0"
          >
            <Badge tone={match.matches ? "ok" : "neutral"}>{match.matches ? "yes" : "no"}</Badge>
            <KeyExpr
              value={match.candidate}
              highlightWildcards={false}
              className="text-tiny min-w-0 flex-1 truncate"
            />
            {match.relation ? (
              <Badge tone={RELATION_TONE[match.relation]}>{match.relation}</Badge>
            ) : null}
          </div>
        ))}
        {matches.data?.length === 0 ? (
          <p className="text-tiny text-ink-faint px-4 py-3">
            No candidate keys yet. Keys appear here once a tap or query has observed them.
          </p>
        ) : null}
      </div>

      <footer className="border-line-soft bg-surface-1 text-tiny text-ink-faint border-t px-4 py-2.5">
        <span className="numeric text-ink-muted">*</span> matches one chunk;{" "}
        <span className="numeric text-ink-muted">**</span> matches zero or more;{" "}
        <span className="numeric text-ink-muted">$*</span> matches within a chunk and is slower.
      </footer>
    </Panel>
  );
}
