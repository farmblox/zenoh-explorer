/**
 * The two things about a key that nothing on a Zenoh network volunteers.
 *
 * Whether data published here can be read back later, and whether anyone's
 * access-control policy would stop it arriving. Both are answered in Rust from
 * state the session already holds, so this asks the network nothing — it is a
 * command rather than an event only because the answer depends on which key you
 * are looking at, and the backend cannot know that in advance.
 */
import { useEffect, useState } from "react";

import { keyspace, type AclFinding, type SessionId, type StorageCoverage } from "@/ipc";

/** The Zenoh message kind a subscription declares. */
const SUBSCRIBE = "declare_subscriber";

/**
 * How long the expression has to settle first.
 *
 * The selected key changes on a click and could be asked for at once, but the
 * toolbar's expression changes per keystroke and asks the same two questions
 * every time.
 */
const SETTLE_MS = 150;

export interface KeyInsight {
  /** Storages that would keep some or all of this key. */
  readonly storages: readonly StorageCoverage[];
  /** Policies that would affect subscribing to it. */
  readonly acl: readonly AclFinding[];
  /** `true` until the first answer for the current key has arrived. */
  readonly loading: boolean;
}

const EMPTY: KeyInsight = { storages: [], acl: [], loading: false };

/**
 * Durability and access control for `keyExpr`.
 *
 * Answers are tagged with the key they belong to so a slow reply for a key you
 * have already navigated away from cannot land on the one you are looking at.
 */
export function useKeyInsight(sessionId: SessionId, keyExpr: string | null): KeyInsight {
  const [answered, setAnswered] = useState<{ key: string; insight: KeyInsight } | null>(null);

  useEffect(() => {
    if (keyExpr === null) return;

    let current = true;
    const timer = setTimeout(() => {
      void Promise.all([
        keyspace.storageCoverage(sessionId, keyExpr),
        keyspace.aclFindings(sessionId, keyExpr, SUBSCRIBE),
      ])
        .then(([storages, acl]) => {
          if (current) setAnswered({ key: keyExpr, insight: { storages, acl, loading: false } });
        })
        .catch(() => {
          if (current) setAnswered({ key: keyExpr, insight: EMPTY });
        });
    }, SETTLE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [sessionId, keyExpr]);

  if (keyExpr === null) return EMPTY;
  if (answered?.key !== keyExpr) return { ...EMPTY, loading: true };
  return answered.insight;
}
