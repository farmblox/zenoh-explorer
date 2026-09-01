import type { ComponentType } from "react";

/**
 * Identifiers for every view. A string union rather than an enum, so the
 * registry is exhaustively checked and a typo is a compile error.
 */
export type ViewId =
  | "topology"
  | "peers"
  | "regions"
  | "keyspace"
  | "admin"
  | "scouting"
  | "events"
  | "transport"
  | "config";

/** Sidebar groupings, in the order they appear. */
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
  /** One line explaining the view; used as the header subtitle and tooltip. */
  readonly description: string;
  /** The view itself. */
  readonly component: ComponentType;
  /**
   * Views below the fold, revealed by the sidebar's "More" toggle. Keeps the
   * primary list to the handful of things people use constantly.
   */
  readonly secondary?: boolean;
  /** `false` for views that work without an open session, e.g. scouting. */
  readonly requiresSession?: boolean;
}
