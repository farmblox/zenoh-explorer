/**
 * The declarations behind a counter.
 *
 * A key node says how many subscribers or queryables sit at or below it; this
 * is the list that number is counting, with the node that made each one. Both
 * come from the same walk in Rust, so the list is always exactly as long as the
 * tile said it would be.
 */
import { useEffect, useState } from "react";

import { keyspace, type DeclarationKind, type KeyDeclaration, type SessionId } from "@/ipc";

export interface Declarations {
  readonly entries: readonly KeyDeclaration[];
  /** `true` until the first answer for the current key and kind has arrived. */
  readonly loading: boolean;
}

const EMPTY: Declarations = { entries: [], loading: false };

/**
 * Declarations of `kind` at or below `prefix`, or nothing when `kind` is null.
 *
 * Answers are tagged with what they answer, so opening a different tile does
 * not briefly show the previous one's list under the new one's heading.
 */
export function useDeclarations(
  sessionId: SessionId,
  prefix: string | null,
  kind: DeclarationKind | null,
): Declarations {
  const [answered, setAnswered] = useState<{ for: string; entries: KeyDeclaration[] } | null>(null);
  const asked = prefix === null || kind === null ? null : `${kind}:${prefix}`;

  useEffect(() => {
    if (prefix === null || kind === null) return;

    let current = true;
    void keyspace
      .declarationsUnder(sessionId, prefix, kind)
      .then((entries) => {
        if (current) setAnswered({ for: `${kind}:${prefix}`, entries });
      })
      .catch(() => {
        if (current) setAnswered({ for: `${kind}:${prefix}`, entries: [] });
      });

    return () => {
      current = false;
    };
  }, [sessionId, prefix, kind]);

  if (asked === null) return EMPTY;
  if (answered?.for !== asked) return { entries: [], loading: true };
  return { entries: answered.entries, loading: false };
}
