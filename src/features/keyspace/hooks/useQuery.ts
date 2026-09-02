/**
 * Asking a key expression what it holds, once.
 *
 * A get and a subscription answer the same question at different tenses: what
 * is on this key now, and what arrives on it next. Their replies are the same
 * `SampleRecord`, so they render in the same table — this hook only has to hold
 * one set of them and say how long they took.
 */
import { useCallback, useState } from "react";

import { data, toIpcError, type SampleRecord, type SessionId } from "@/ipc";

/** Long enough for a WAN hop, short enough that a wedged node is not a hang. */
const TIMEOUT_MS = 5_000;

export interface QueryResult {
  /** The selector that was asked. */
  readonly selector: string;
  readonly replies: readonly SampleRecord[];
  /** Wall-clock time the query took, in milliseconds. */
  readonly tookMs: number;
  readonly error: string | null;
}

export interface QueryState {
  readonly result: QueryResult | null;
  readonly running: boolean;
  readonly run: (selector: string) => void;
  readonly clear: () => void;
}

export function useQuery(sessionId: SessionId): QueryState {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    (selector: string) => {
      setRunning(true);
      const started = performance.now();

      void data
        .query(sessionId, selector, TIMEOUT_MS)
        .then((replies) => {
          setResult({
            selector,
            replies,
            tookMs: Math.round(performance.now() - started),
            error: null,
          });
        })
        .catch((thrown: unknown) => {
          setResult({
            selector,
            replies: [],
            tookMs: Math.round(performance.now() - started),
            error: toIpcError(thrown).message,
          });
        })
        .finally(() => setRunning(false));
    },
    [sessionId],
  );

  const clear = useCallback(() => setResult(null), []);

  return { result, running, run, clear };
}
