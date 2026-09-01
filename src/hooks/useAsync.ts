import { useCallback, useEffect, useRef, useState } from "react";

import { toIpcError } from "@/ipc";

/** The three states any one-shot read can be in. */
export interface AsyncState<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export interface AsyncResult<T> extends AsyncState<T> {
  /** Runs the operation again. */
  readonly reload: () => void;
}

export interface AsyncOptions {
  /** When false the operation is not run and the result stays empty. */
  readonly enabled?: boolean;
}

/** A settled result, tagged with the read it belongs to. */
interface Settled<T> {
  readonly key: string;
  readonly data: T | null;
  readonly error: string | null;
}

/**
 * Runs an async operation and tracks its state.
 *
 * `key` identifies the read: change it and the operation runs again, keep it and
 * it doesn't. Callers build one from whatever the read depends on, e.g.
 * `` `${sessionId}:${prefix}` ``. It's a string rather than a dependency array
 * on purpose — a spread array is impossible for the linter to verify, and "what
 * identifies this read" is a clearer question to answer than "what did I close
 * over".
 *
 * `loading` is derived from whether the settled result matches the current key,
 * not stored. That's what keeps this to a single `setState`, in the promise
 * callback, and it means a stale reply for a key we've moved on from is ignored
 * for free: switching session tabs starts a new read while the old one is still
 * in flight, and the old one's key no longer matches when it lands.
 */
export function useAsync<T>(
  operation: () => Promise<T>,
  key: string,
  options: AsyncOptions = {},
): AsyncResult<T> {
  const { enabled = true } = options;

  const [settled, setSettled] = useState<Settled<T> | null>(null);
  // Bumped by `reload` so the same key can be re-fetched.
  const [attempt, setAttempt] = useState(0);

  const readKey = `${key}#${attempt}`;

  // The operation closes over fresh props every render, but should only *run*
  // when the key changes. A ref separates those. Updated in an effect rather
  // than during render, and declared before the effect below so it always
  // updates first.
  const latest = useRef(operation);
  useEffect(() => {
    latest.current = operation;
  });

  useEffect(() => {
    if (!enabled) return;

    let current = true;
    latest.current().then(
      (data) => {
        if (current) setSettled({ key: readKey, data, error: null });
      },
      (thrown: unknown) => {
        if (current) {
          setSettled({ key: readKey, data: null, error: toIpcError(thrown).message });
        }
      },
    );

    return () => {
      current = false;
    };
  }, [enabled, readKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const fresh = settled?.key === readKey ? settled : null;
  return {
    data: fresh?.data ?? null,
    error: fresh?.error ?? null,
    loading: enabled && fresh === null,
    reload,
  };
}
