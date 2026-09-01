/**
 * Client-side key-expression helpers.
 *
 * Deliberately *not* a matcher. Deciding whether an expression matches a key is
 * `zenoh-keyexpr`'s job, reached through `ipc.keyspace.testKeyExpr` — a second
 * implementation here would eventually disagree with the router, which is
 * exactly the class of bug the key-expression view exists to catch.
 *
 * What lives here is presentation: splitting an expression up so wildcards can
 * be highlighted, and cheap syntactic checks that do not need a round trip.
 */

/** A piece of a key expression, tagged with how it should be rendered. */
export interface KeyExprToken {
  readonly text: string;
  /** `literal` for a plain chunk, otherwise which wildcard it is. */
  readonly kind: "literal" | "star" | "double-star" | "sub-chunk" | "separator";
}

/**
 * Splits an expression into tokens, keeping separators so the original string
 * can be reconstructed by concatenating `text`.
 */
export function tokenize(expr: string): KeyExprToken[] {
  const tokens: KeyExprToken[] = [];
  const chunks = expr.split("/");

  chunks.forEach((chunk, index) => {
    if (index > 0) tokens.push({ text: "/", kind: "separator" });
    if (chunk.length === 0) return;
    tokens.push({ text: chunk, kind: classifyChunk(chunk) });
  });

  return tokens;
}

/** How a single chunk should be rendered. */
function classifyChunk(chunk: string): KeyExprToken["kind"] {
  if (chunk === "**") return "double-star";
  if (chunk === "*") return "star";
  if (chunk.includes("$*")) return "sub-chunk";
  return "literal";
}

/** `true` when the expression contains any wildcard. */
export function hasWildcard(expr: string): boolean {
  return expr.includes("*");
}

/**
 * `true` when the expression addresses the admin space.
 *
 * Admin keys are ordinary keys under the `@` prefix, but the UI treats them
 * differently — a separate browser, and different affordances.
 */
export function isAdminKey(expr: string): boolean {
  return expr.startsWith("@");
}

/** Joins chunks into a key expression, dropping empties. */
export function joinKey(...chunks: string[]): string {
  return chunks
    .flatMap((chunk) => chunk.split("/"))
    .filter(Boolean)
    .join("/");
}

/** The parent prefix of a key, or `""` at the root. */
export function parentOf(key: string): string {
  const index = key.lastIndexOf("/");
  return index <= 0 ? "" : key.slice(0, index);
}

/** Every ancestor of a key, root first — the breadcrumb trail. */
export function ancestorsOf(key: string): string[] {
  const chunks = key.split("/").filter(Boolean);
  return chunks.map((_, index) => chunks.slice(0, index + 1).join("/"));
}
