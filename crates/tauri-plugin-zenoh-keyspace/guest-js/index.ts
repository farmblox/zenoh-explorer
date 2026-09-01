/** TypeScript client for the `zenoh-keyspace` plugin. */
import { invoke } from "@tauri-apps/api/core";

import type { KeyExprAnalysis } from "@/ipc/generated/KeyExprAnalysis";
import type { KeySpaceSnapshot } from "@/ipc/generated/KeySpaceSnapshot";
import type { MatchResult } from "@/ipc/generated/MatchResult";
import type { SessionId } from "@/ipc/generated/SessionId";

/**
 * Returns the immediate children of `prefix` — pass `""` for the root.
 *
 * One level at a time: a real deployment's key space is far too large to send
 * whole, so the tree is expanded lazily as the user opens it.
 */
export function expandKeys(sessionId: SessionId, prefix: string): Promise<KeySpaceSnapshot> {
  return invoke("plugin:zenoh-keyspace|expand_keys", { sessionId, prefix });
}

/**
 * Asks the network what it has declared, and folds the answer into the index.
 *
 * The key space is otherwise only filled by traffic the explorer happened to
 * witness, which means a configured but idle network looks like an empty one.
 * Declarations are published whether or not anything is flowing.
 */
export function refreshDeclarations(sessionId: SessionId): Promise<KeySpaceSnapshot> {
  return invoke("plugin:zenoh-keyspace|refresh_declarations", { sessionId });
}

/** Forgets every observed key for this session. */
export function clearKeys(sessionId: SessionId): Promise<void> {
  return invoke("plugin:zenoh-keyspace|clear_keys", { sessionId });
}

/**
 * Validates and canonicalises one key expression.
 *
 * Answered by `zenoh-keyexpr` itself rather than a JavaScript glob matcher, so
 * the verdict is always the one the router would reach.
 */
export function analyseKeyExpr(expr: string): Promise<KeyExprAnalysis> {
  return invoke("plugin:zenoh-keyspace|analyse_key_expr", { expr });
}

/** Tests `expr` against candidate keys, reporting the precise set relation. */
export function testKeyExpr(expr: string, candidates: string[]): Promise<MatchResult[]> {
  return invoke("plugin:zenoh-keyspace|test_key_expr", { expr, candidates });
}
