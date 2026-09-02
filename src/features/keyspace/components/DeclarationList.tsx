import { X } from "lucide-react";

import { KeyExpr, Zid } from "@/components/domain";
import { Button, DataTable, EmptyState, SectionLabel, Spinner, type Column } from "@/components/ui";
import type { DeclarationKind, KeyDeclaration } from "@/ipc";
import { groupedNumber } from "@/lib/format";
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
  subscriber: "Nothing published under this key is delivered anywhere.",
  publisher: "No node has declared that it publishes under this key.",
  queryable: "A get under this key answers nothing, because nobody serves it.",
  querier: "No node has declared that it queries under this key.",
  token: "No application is holding a liveliness token under this key.",
};

const COLUMNS: readonly Column<KeyDeclaration>[] = [
  {
    id: "keyExpr",
    header: "Declared expression",
    width: "flex",
    // As declared, wildcards and all: `fleet/**` is what the node actually
    // asked for, and resolving it would invent detail it never claimed.
    cell: (row) => <KeyExpr value={row.keyExpr} className="text-tiny" />,
  },
  {
    id: "zid",
    header: "Declared by",
    width: 220,
    cell: (row) => <Zid zid={row.zid} copyable />,
  },
];

export interface DeclarationListProps {
  kind: DeclarationKind;
  declarations: Declarations;
  onClose: () => void;
}

/**
 * Who declared what, in the pane the sample table normally holds.
 *
 * Not in the detail strip above it. A key can carry hundreds of declarations,
 * and a long list in a short box is a scrollbar inside a scrollbar — so it
 * takes the room the stream has, and the counter that opened it is the way
 * back. A table rather than a list for the same reason: this one is virtualised
 * and a busy key can fill it.
 */
export function DeclarationList({ kind, declarations, onClose }: DeclarationListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-line-soft flex h-11 shrink-0 items-center gap-3 border-b px-5">
        <SectionLabel>{HEADINGS[kind]}</SectionLabel>
        {declarations.loading ? null : (
          <span className="numeric text-tiny text-ink-faint">
            {groupedNumber(declarations.entries.length)}
          </span>
        )}
        <span className="flex-1" />
        {/* "Close", not "Back to samples": with no tap running there are no
            samples to go back to, and the button would be promising one. */}
        <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={onClose}>
          Close
        </Button>
      </header>

      {declarations.loading ? (
        <EmptyState
          icon={<Spinner />}
          title="Reading declarations"
          description="From the index this session already holds, so it asks the network nothing."
        />
      ) : declarations.entries.length === 0 ? (
        <EmptyState title="Nothing declared here" description={NOTHING[kind]} />
      ) : (
        <DataTable
          id="keyspace-declarations"
          columns={COLUMNS}
          rows={declarations.entries}
          rowKey={(row) => `${row.zid}:${row.keyExpr}`}
          className="flex-1"
        />
      )}
    </div>
  );
}
