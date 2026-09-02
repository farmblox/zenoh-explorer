import { X } from "lucide-react";

import { KeyExpr } from "@/components/domain";
import { Button, EmptyState, SectionLabel, Spinner } from "@/components/ui";
import type { SampleRecord } from "@/ipc";
import { groupedNumber } from "@/lib/format";
import type { QueryResult } from "../hooks/useQuery";
import { SampleTable } from "./SampleTable";

export interface QueryRepliesProps {
  result: QueryResult;
  running: boolean;
  selected: number | null;
  onSelect: (sample: SampleRecord) => void;
  onClose: () => void;
}

/**
 * What a get came back with.
 *
 * The same table the live stream uses, because the replies are the same kind of
 * thing — a get and a subscription differ in tense, not in what they return.
 * What the header adds is the part a stream cannot have: this is a complete
 * answer, and here is how long the network took to give it.
 */
export function QueryReplies({ result, running, selected, onSelect, onClose }: QueryRepliesProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-line-soft flex h-11 shrink-0 items-center gap-3 border-b px-5">
        <SectionLabel>Replied</SectionLabel>
        {running ? null : (
          <span className="numeric text-tiny text-ink-faint">
            {groupedNumber(result.replies.length)} · {result.tookMs}ms
          </span>
        )}
        <KeyExpr value={result.selector} className="text-tiny min-w-0 flex-1" />
        <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={onClose}>
          Close
        </Button>
      </header>

      {running ? (
        <EmptyState
          icon={<Spinner />}
          title="Waiting for replies"
          description="A wildcard query runs to its timeout — Zenoh cannot know that every queryable has answered."
        />
      ) : result.error ? (
        <EmptyState title="The query failed" description={result.error} />
      ) : result.replies.length === 0 ? (
        <EmptyState
          title="Nobody answered"
          description="No queryable or storage serves this key expression, so there was nothing to reply. Check what is declared under it above."
        />
      ) : (
        <SampleTable samples={result.replies} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}
