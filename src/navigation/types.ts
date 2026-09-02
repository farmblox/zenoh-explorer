import type { ComponentType } from "react";

/**
 * Identifiers for every view. A string union rather than an enum, so the
 * registry is exhaustively checked and a typo is a compile error.
 */
export type ViewId =
  | "topology"
  | "nodes"
  | "regions"
  | "keyspace"
  | "admin"
  | "scouting"
  | "events"
  | "transport"
  | "config";

/**
 * Which cluster a view sits in, in the order they appear.
 *
 * The sidebar draws a hairline wherever this changes and never renders the name,
 * so these are seams rather than headings.
 */
export type ViewGroup = "explore" | "data" | "activity" | "session";

/** Everything the shell needs to know about a view, without importing it. */
export interface ViewDefinition {
  readonly id: ViewId;
  /** Label in the sidebar. */
  readonly label: string;
  /** Which sidebar section it belongs to. */
  readonly group: ViewGroup;
  /** Icon component, from lucide-react. */
  readonly icon: ComponentType<{ className?: string; size?: number }>;
  /** One line explaining the view, read by the command palette. */
  readonly description: string;
  /** The view itself. */
  readonly component: ComponentType;
  /** `false` for views that work without an open session, e.g. scouting. */
  readonly requiresSession?: boolean;
}
