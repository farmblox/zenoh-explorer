import { useCallback, useEffect, useRef, useState } from "react";

import { keyspace, type KeyNode, type SessionId } from "@/ipc";
import { useLiveEpoch } from "@/stores";

/** Children of one prefix, once they have been fetched. */
export type Level = { status: "loading" } | { status: "ready"; nodes: KeyNode[] };

export interface KeyTreeState {
  readonly levels: Readonly<Record<string, Level>>;
  readonly open: ReadonlySet<string>;
  readonly totalKeys: number;
  readonly loading: boolean;
  readonly toggle: (key: string) => void;
}

/**
 * The lazily expanded key tree for one session.
 *
 * Levels are cached once loaded, because collapsing and reopening a branch is a
 * navigation gesture rather than a request to refetch.
 *
 * The root is re-read whenever the network reports a change — a node declaring
 * a subscriber bumps the epoch, and the tree follows. The cache is dropped at
 * the same time, because a new declaration can change the counts on any level.
 */
export function useKeyTree(sessionId: SessionId): KeyTreeState {
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [totalKeys, setTotalKeys] = useState(0);
  // Starts true because the first read is kicked off on mount. Deriving it from
  // the mount rather than setting it there keeps the effect free of a
  // synchronous state write.
  const [loading, setLoading] = useState(true);

  /** Guards against a reply from a session the user has already left. */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const load = useCallback(
    async (prefix: string) => {
      setLevels((current) => ({ ...current, [prefix]: { status: "loading" } }));
      const snapshot = await keyspace.expandKeys(sessionId, prefix);
      if (!live.current) return;
      setLevels((current) => ({
        ...current,
        [prefix]: { status: "ready", nodes: snapshot.children },
      }));
      setTotalKeys(snapshot.totalKeys);
    },
    [sessionId],
  );

  // Declarations are pushed: a node declaring a subscriber reaches the backend
  // as a live sample, which bumps this. The tree follows without being asked.
  const epoch = useLiveEpoch(sessionId);

  const read = useCallback(async () => {
    try {
      const snapshot = await keyspace.refreshDeclarations(sessionId);
      if (!live.current) return;
      setLevels({ "": { status: "ready", nodes: snapshot.children } });
      setOpen(new Set());
      setTotalKeys(snapshot.totalKeys);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [sessionId]);

  // Read on open, and again whenever the network moves. Without the first read
  // the tree would only ever show keys that happened to carry traffic while the
  // explorer was watching, which on an idle network is nothing at all.
  useEffect(() => {
    void read();
    // `epoch` is the dependency that matters: `read` is stable per session.
  }, [read, epoch]);

  const toggle = useCallback(
    (key: string) => {
      setOpen((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setLevels((current) => {
        if (current[key]) return current;
        void load(key);
        return current;
      });
    },
    [load],
  );

  return { levels, open, totalKeys, loading, toggle };
}
