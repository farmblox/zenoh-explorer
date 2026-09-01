import { cn } from "@/lib/cn";
import { tokenize, type KeyExprToken } from "@/lib/keyexpr";

export interface KeyExprProps {
  value: string;
  /** Dims everything except the wildcards, to explain what varies. */
  highlightWildcards?: boolean;
  className?: string;
}

/** Colour per token kind. `$*` is warned about because it is the slow one. */
const TOKEN_CLASS: Record<KeyExprToken["kind"], string> = {
  literal: "text-ink",
  separator: "text-ink-faint",
  star: "text-accent",
  "double-star": "text-accent-strong",
  "sub-chunk": "text-warn",
};

/**
 * A key expression with its wildcards picked out.
 *
 * `*`, `**` and `$*` mean genuinely different things, and which one is in a
 * given position is the single most important thing to see when reading a
 * subscription — so they are coloured rather than left as undifferentiated
 * monospace.
 */
export function KeyExpr({ value, highlightWildcards = true, className }: KeyExprProps) {
  if (!highlightWildcards) {
    return <span className={cn("numeric selectable text-ink", className)}>{value}</span>;
  }

  return (
    <span className={cn("numeric selectable", className)} title={value}>
      {tokenize(value).map((token, index) => (
        // Tokens have no identity of their own, so position is the only key
        // available. Safe here: the list is regenerated wholesale whenever the
        // expression changes, so a stale index can never be reused.
        <span key={index} className={TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
    </span>
  );
}
