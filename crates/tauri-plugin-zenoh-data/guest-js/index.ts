/** TypeScript client for the `zenoh-data` plugin. */
import { Channel, invoke } from "@tauri-apps/api/core";

import type { SampleBatch } from "@/ipc/generated/SampleBatch";
import type { SampleRecord } from "@/ipc/generated/SampleRecord";
import type { SessionId } from "@/ipc/generated/SessionId";
import type { TapId } from "@/ipc/generated/TapId";
import type { TapSpec } from "@/ipc/generated/TapSpec";
import type { TapSummary } from "@/ipc/generated/TapSummary";

/**
 * Runs a `get` and returns every reply.
 *
 * The selector may address the admin space (`@/**`) as readily as user keys — to
 * Zenoh they are one namespace.
 */
export function query(
  sessionId: SessionId,
  selector: string,
  timeoutMs?: number,
): Promise<SampleRecord[]> {
  return invoke("plugin:zenoh-data|query", { sessionId, selector, timeoutMs });
}

/** Publishes a payload to a key. Requires the `zenoh-data:read-write` permission. */
export function put(
  sessionId: SessionId,
  key: string,
  payload: Uint8Array,
  encoding?: string,
): Promise<void> {
  return invoke("plugin:zenoh-data|put", {
    sessionId,
    key,
    payload: Array.from(payload),
    encoding,
  });
}

/** Deletes a key. Requires the `zenoh-data:read-write` permission. */
export function del(sessionId: SessionId, key: string): Promise<void> {
  return invoke("plugin:zenoh-data|delete", { sessionId, key });
}

/** A running tap and the handle used to stop it. */
export interface Tap {
  readonly id: TapId;
  /** Stops the subscription. Safe to call more than once. */
  stop(): Promise<void>;
}

/**
 * Subscribes to a key expression, delivering coalesced batches to `onBatch`.
 *
 * Uses an IPC channel rather than the global event bus. A tap has exactly one
 * consumer and a busy key expression can emit tens of thousands of samples a
 * second; a channel keeps that stream ordered and private to this caller, while
 * the backend batches on a timer so the bridge sees a bounded message rate.
 */
export async function startTap(
  sessionId: SessionId,
  spec: TapSpec,
  onBatch: (batch: SampleBatch) => void,
): Promise<Tap> {
  const channel = new Channel<SampleBatch>();
  channel.onmessage = onBatch;

  const id = await invoke<TapId>("plugin:zenoh-data|start_tap", {
    sessionId,
    spec,
    onBatch: channel,
  });

  let stopped = false;
  return {
    id,
    async stop() {
      if (stopped) return;
      stopped = true;
      await invoke("plugin:zenoh-data|stop_tap", { sessionId, tapId: id });
    },
  };
}

/** Every tap running on a session. */
export function listTaps(sessionId: SessionId): Promise<TapSummary[]> {
  return invoke("plugin:zenoh-data|list_taps", { sessionId });
}
