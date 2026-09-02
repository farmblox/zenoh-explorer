/** TypeScript client for the `zenoh-keyspace` plugin. */
import { invoke } from "@tauri-apps/api/core";

import type { AclFinding } from "@/ipc/generated/AclFinding";
import type { DeclarationKind } from "@/ipc/generated/DeclarationKind";
import type { KeyDeclaration } from "@/ipc/generated/KeyDeclaration";
import type { KeyExprAnalysis } from "@/ipc/generated/KeyExprAnalysis";
import type { KeySpaceSnapshot } from "@/ipc/generated/KeySpaceSnapshot";
import type { MatchResult } from "@/ipc/generated/MatchResult";
import type { NodeDeclaration } from "@/ipc/generated/NodeDeclaration";
import type { SessionId } from "@/ipc/generated/SessionId";
import type { StorageCoverage } from "@/ipc/generated/StorageCoverage";

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

/**
 * What one node has declared: the key expressions it subscribes to or answers on.
 *
 * Reads the index the explorer already holds, so it asks the network nothing.
 * Attributed rather than aggregated — the key tree can say eleven subscribers
 * exist under `fleet/**`, this says which of them are this node's.
 */
export function nodeDeclarations(sessionId: SessionId, zid: string): Promise<NodeDeclaration[]> {
  return invoke("plugin:zenoh-keyspace|node_declarations", { sessionId, zid });
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

/**
 * What the network's access-control policies would do to `keyExpr`.
 *
 * ACL is the quietest failure Zenoh has: a node denying `declare_subscriber` on
 * an expression that covers yours does not refuse anything or log at you — the
 * samples just never arrive, and every other diagnostic says the network is
 * healthy, because it is.
 *
 * `message` is a Zenoh message kind spelled as the configuration spells it:
 * `declare_subscriber`, `put`, `delete`, `declare_queryable`, `query`, `reply`,
 * `liveliness_token`, `declare_liveliness_subscriber`, `liveliness_query`.
 */
export function aclFindings(
  sessionId: SessionId,
  keyExpr: string,
  message: string,
): Promise<AclFinding[]> {
  return invoke("plugin:zenoh-keyspace|acl_findings", { sessionId, keyExpr, message });
}

/**
 * Which storages would keep data published on `keyExpr`.
 *
 * Answers "can I read this back later, and from where" — a question nothing
 * else on a Zenoh network will answer. A key covered only by the built-in
 * `memory` volume is durable exactly until the node holding it restarts, and
 * `inMemory` on the reply says so.
 *
 * The relation is measured from the storage to the key expression: `includes`
 * means everything asked about is kept, `intersects` means only part of it is.
 */
export function storageCoverage(sessionId: SessionId, keyExpr: string): Promise<StorageCoverage[]> {
  return invoke("plugin:zenoh-keyspace|storage_coverage", { sessionId, keyExpr });
}

/**
 * Every declaration of one kind at or below `prefix`, and who made it.
 *
 * What the counters on a key node are counting. The tile says how many; this is
 * the list behind it. Both are computed by the same walk in Rust, so the length
 * of this list is exactly the number the tile showed.
 */
export function declarationsUnder(
  sessionId: SessionId,
  prefix: string,
  kind: DeclarationKind,
): Promise<KeyDeclaration[]> {
  return invoke("plugin:zenoh-keyspace|declarations_under", { sessionId, prefix, kind });
}

/**
 * How many observed keys an expression would match.
 *
 * The number that makes an expression legible while it is being typed:
 * `fleet/**` reaching 148 keys and `fleet/*` reaching 3 is the difference
 * between them, in the only terms that mean anything — this network's keys.
 *
 * Read from the index this session already holds, so it asks the network
 * nothing.
 */
export function matchingKeys(sessionId: SessionId, expr: string): Promise<number> {
  return invoke("plugin:zenoh-keyspace|matching_keys", { sessionId, expr });
}
