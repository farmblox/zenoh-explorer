import { KeyExpr, Zid } from "@/components/domain";
import { Skeleton } from "@/components/ui";
import type { DeclarationKind } from "@/ipc";
import type { Declarations } from "../hooks/useDeclarations";

/** What each kind is called when it is the thing being listed. */
const HEADINGS: Record<DeclarationKind, string> = {
  subscriber: "Subscribed to by",
  publisher: "Published on by",
  queryable: "Answered on by",
  querier: "Queried by",
  token: "Held alive by",
};

/** What it means when a kind has nothing under this key. */
const NOTHING: Record<DeclarationKind, string> = {
  subscriber: "No node subscribes under this key, so nothing published here is delivered anywhere.",
  publisher: "No node has declared that it publishes under this key.",
  queryable: "No node answers queries under this key, so a get here returns nothing.",
  querier: "No node has declared that it queries under this key.",
  token: "No application holds a liveliness token under this key.",
};

export interface DeclarationListProps {
  kind: DeclarationKind;
  declarations: Declarations;
}

/**
 * Who declared what, beneath the counter that summarised them.
 *
 * The expression is the wide column and the node is the narrow one: two nodes
 * declaring `fleet/**` is ordinary, and the same node declaring forty different
 * expressions is what you are usually looking at.
 */
export function DeclarationList({ kind, declarations }: DeclarationListProps) {
  if (declarations.loading) {
    return <Skeleton className="border-line-soft h-20 w-full border-t" />;
  }

  if (declarations.entries.length === 0) {
    return (
      <p className="border-line-soft text-tiny text-ink-muted border-t px-4 py-2.5">
        {NOTHING[kind]}
      </p>
    );
  }

  // No border or radius of its own: it sits inside the panel that holds the
  // tile it belongs to, and a card nested in a card is a seam that says these
  // are separate things when they are one.
  return (
    <div className="border-line-soft bg-surface-1 border-t">
      <div className="text-tiny text-ink-faint px-4 pt-2.5 pb-1.5 font-medium">
        {HEADINGS[kind]}
      </div>
      <ul className="divide-line-soft scroll-thin max-h-64 divide-y overflow-y-auto">
        {declarations.entries.map((entry) => (
          <li key={`${entry.zid}:${entry.keyExpr}`} className="flex items-center gap-3 px-4 py-2">
            <KeyExpr value={entry.keyExpr} className="text-tiny min-w-0 flex-1" />
            <Zid zid={entry.zid} copyable className="shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
